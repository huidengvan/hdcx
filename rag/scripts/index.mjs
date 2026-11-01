/**
 * 切块 → Workers AI 生成向量 → 写入 Vectorize，并维护 rag/manifest.json 做增量更新。
 * 文章内容（切块结果）有变化时整篇替换：先删旧向量再写新向量，因为段落编号可能整体位移。
 *
 * 有写入或删除时，自动把 workers/rag-api/wrangler.toml 的 INDEX_VERSION 加 1（使接口结果缓存失效），之后需部署接口；
 * 一般直接用 pnpm rag:update（索引 + 部署）。
 *
 * 用法：node rag/scripts/index.mjs [--only books/b4] [--dry-run] [--full] [--force]
 *   --force：跳过“构建产物比源文件旧”的检查
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildChunks, printStats } from './build-chunks.mjs';
import { annotateDuplicates } from './dedupe.mjs';
import { ROOT, EMBED_MODEL, MANIFEST_PATH, loadEnv, cfFetch, parseArgs, matchOnly, readJson, writeJson } from './lib.mjs';

const EMBED_BATCH = 20;
const UPSERT_BATCH = 100;
const GET_BATCH = 20;

const WRANGLER_TOML = path.join(ROOT, 'workers/rag-api/wrangler.toml');

const { only, 'dry-run': dryRun, full, force } = parseArgs();
// 重复标注需要全部分类一起计算，再按 --only 取本次范围
const allDocs = buildChunks({});
const dupStat = annotateDuplicates(allDocs);
const docs = allDocs.filter((d) => matchOnly(only, d.doc));
printStats(docs);
console.log(`跨分类重复：${dupStat.dupChunks} 块标为重复，${dupStat.alsoInChunks} 块带「亦见于」`);

// 源文件比构建产物新，说明忘了 pnpm build：段落编号可能已变，用旧 HTML 建索引会导致跳转错位
const stale = docs.filter((d) => {
    const html = path.join(ROOT, 'build', d.doc, 'index.html');
    const src = ['.md', '.mdx'].map((ext) => path.join(ROOT, d.doc + ext)).find((p) => fs.existsSync(p));
    return src && fs.statSync(src).mtimeMs > fs.statSync(html).mtimeMs;
});
if (stale.length && !force) {
    console.error(`以下 ${stale.length} 篇的源文件比构建产物新，请先执行 pnpm build（或加 --force 跳过）：`);
    stale.slice(0, 10).forEach((d) => console.error(`  ${d.doc}`));
    process.exit(1);
}

const manifest = readJson(MANIFEST_PATH, { model: EMBED_MODEL, docs: {} });
const changed = docs.filter((d) => full || manifest.docs[d.doc]?.hash !== d.hash);
// 正文未变、仅重复标注变化：复用已有向量，只更新 metadata，不消耗 Workers AI
const metaOnly = docs.filter((d) => !changed.includes(d) && manifest.docs[d.doc]?.metaHash !== d.metaHash);
const present = new Set(docs.map((d) => d.doc));
// 本次范围内已不存在的文章
const removed = Object.keys(manifest.docs).filter((doc) => matchOnly(only, doc) && !present.has(doc));

console.log(
    `需更新 ${changed.length} 篇（${changed.reduce((n, d) => n + d.chunks.length, 0)} 块），` +
        `仅更新标注 ${metaOnly.length} 篇，需删除 ${removed.length} 篇`,
);
if (dryRun || (!changed.length && !metaOnly.length && !removed.length)) process.exit(0);

const env = loadEnv();
const base = `/vectorize/v2/indexes/${env.indexName}`;

async function embed(texts) {
    const result = await cfFetch(env, `/ai/run/${EMBED_MODEL}`, { method: 'POST', body: { text: texts } });
    const vectors = result.data || result.response;
    if (vectors?.length !== texts.length) throw new Error('向量数量与输入不符');
    return vectors;
}

async function deleteIds(ids) {
    for (let i = 0; i < ids.length; i += UPSERT_BATCH) {
        await cfFetch(env, `${base}/delete_by_ids`, { method: 'POST', body: { ids: ids.slice(i, i + UPSERT_BATCH) } });
    }
}

// metadata 不含 embedText 与未标注的空字段
async function upsert(d, vectors) {
    const lines = d.chunks.map(({ id, embedText, ...metadata }, i) => JSON.stringify({ id, values: vectors[i], metadata }));
    for (let i = 0; i < lines.length; i += UPSERT_BATCH) {
        await cfFetch(env, `${base}/upsert`, {
            method: 'POST',
            contentType: 'application/x-ndjson',
            body: lines.slice(i, i + UPSERT_BATCH).join('\n'),
        });
    }
}

for (const doc of removed) {
    await deleteIds(manifest.docs[doc].ids);
    delete manifest.docs[doc];
    writeJson(MANIFEST_PATH, manifest);
    console.log(`已删除 ${doc}`);
}

for (const d of changed) {
    const vectors = [];
    for (let i = 0; i < d.chunks.length; i += EMBED_BATCH) {
        vectors.push(...(await embed(d.chunks.slice(i, i + EMBED_BATCH).map((c) => c.embedText))));
    }

    const newIds = new Set(d.chunks.map((c) => c.id));
    const stale = (manifest.docs[d.doc]?.ids || []).filter((id) => !newIds.has(id));
    if (stale.length) await deleteIds(stale);

    await upsert(d, vectors);
    manifest.docs[d.doc] = { hash: d.hash, metaHash: d.metaHash, ids: [...newIds] };
    writeJson(MANIFEST_PATH, manifest);
    console.log(`已写入 ${d.doc}《${d.title}》${d.chunks.length} 块`);
}

for (const d of metaOnly) {
    // 正文未变则块 id 不变，从 Vectorize 取回已有向量
    const values = new Map();
    const ids = d.chunks.map((c) => c.id);
    for (let i = 0; i < ids.length; i += GET_BATCH) {
        const got = await cfFetch(env, `${base}/get_by_ids`, { method: 'POST', body: { ids: ids.slice(i, i + GET_BATCH) } });
        for (const v of got) values.set(v.id, v.values);
    }
    if (values.size !== ids.length) throw new Error(`${d.doc} 有 ${ids.length - values.size} 个向量未找到，请加 --only ${d.doc} --full 重建`);
    await upsert(d, ids.map((id) => values.get(id)));
    manifest.docs[d.doc] = { ...manifest.docs[d.doc], metaHash: d.metaHash };
    writeJson(MANIFEST_PATH, manifest);
    console.log(`已更新标注 ${d.doc}《${d.title}》`);
}

// 递增接口缓存版本，部署后旧的搜索缓存即失效
const toml = fs.readFileSync(WRANGLER_TOML, 'utf8');
const version = Number(toml.match(/^INDEX_VERSION = "(\d+)"/m)?.[1] || 0) + 1;
fs.writeFileSync(WRANGLER_TOML, toml.replace(/^INDEX_VERSION = "\d+"/m, `INDEX_VERSION = "${version}"`));

console.log(`完成。INDEX_VERSION 已更新为 ${version}，请部署接口（pnpm rag:deploy）使缓存失效。`);
console.log('Vectorize 写入为异步，通常数秒到几分钟后可查询。');
