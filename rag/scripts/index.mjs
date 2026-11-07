/**
 * 切块 → Workers AI（bge-m3）生成向量 → 写入 Qdrant，并维护 rag/manifest.json 做增量更新。
 * 文章内容（切块结果）有变化时整篇替换：先删旧向量再写新向量，因为段落编号可能整体位移。
 *
 * 有写入或删除时，自动把 workers/rag-api/wrangler.toml 的 INDEX_VERSION 加 1（使接口结果缓存失效），之后需部署接口；
 * 一般直接用 pnpm rag:update（索引 + 部署）。
 *
 * 用法：node rag/scripts/index.mjs [--only books/b4] [--dry-run] [--full] [--force] [--embed cf|sf|both] [--budget 8000]
 *   --force：跳过“构建产物比源文件旧”的检查
 *   --embed：生成向量的服务，默认 cf（Workers AI）；sf 为硅基流动；both 两边同时跑，批量入库时分摊额度
 *   --budget：本次最多使用的 Workers AI Neurons；用完或当日额度耗尽时停止，已写入的文章会保存，再次运行同一命令即可继续
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildChunks, printStats } from './build-chunks.mjs';
import { annotateDuplicates } from './dedupe.mjs';
import { createEmbedders, embedDoc, QuotaExhausted } from './embed.mjs';
import { ROOT, EMBED_MODEL, MANIFEST_PATH, chunkId, parseArgs, matchOnly, readJson, writeJson } from './lib.mjs';
import { loadQdrant, ensureCollection, upsertPoints, deletePoints, getVectors } from './qdrant.mjs';

const WRANGLER_TOML = path.join(ROOT, 'workers/rag-api/wrangler.toml');

const { only, 'dry-run': dryRun, full, force, embed: embedWith = 'cf', budget = 0 } = parseArgs();
// 重复标注需要全部分类一起计算，再按 --only 取本次范围（按源目录收录的 group，页面路径不在 group id 下）
const allDocs = buildChunks({});
const dupStat = annotateDuplicates(allDocs);
const inRange = (doc, group) => matchOnly(only, doc) || (group && matchOnly(only, group));
const docs = allDocs.filter((d) => inRange(d.doc, d.group));
printStats(docs);
console.log(`重复内容：${dupStat.dupChunks} 块标为重复，${dupStat.alsoInChunks} 块带「亦见于」`);

// 源文件比构建产物新，说明忘了 pnpm build：段落编号可能已变，用旧 HTML 建索引会导致跳转错位
const stale = docs.filter((d) => {
    const html = path.join(ROOT, 'build', d.doc, 'index.html');
    if (!fs.existsSync(html)) return false;
    const src = d.source
        ? path.join(ROOT, d.source)
        : ['.md', '.mdx'].map((ext) => path.join(ROOT, d.doc + ext)).find((p) => fs.existsSync(p));
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
const removed = Object.keys(manifest.docs).filter((doc) => inRange(doc, manifest.docs[doc].group) && !present.has(doc));

console.log(
    `需更新 ${changed.length} 篇（${changed.reduce((n, d) => n + d.chunks.length, 0)} 块），` +
        `仅更新标注 ${metaOnly.length} 篇，需删除 ${removed.length} 篇`,
);
if (dryRun || (!changed.length && !metaOnly.length && !removed.length)) process.exit(0);

const embedders = changed.length ? createEmbedders(embedWith, Number(budget)) : [];
const q = loadQdrant();
await ensureCollection(q);

const deleteIds = (ids) => deletePoints(q, ids);
// 文章已写入的全部块 id
const indexedIds = (doc) => Array.from({ length: manifest.docs[doc]?.chunks ?? 0 }, (_, i) => chunkId(doc, i));

// payload 不含 embedText（只用于生成向量）
const upsert = (d, vectors) => upsertPoints(q, d.chunks.map(({ id, embedText, ...payload }, i) => ({ cid: id, vector: vectors[i], payload })));

for (const doc of removed) {
    await deleteIds(indexedIds(doc));
    delete manifest.docs[doc];
    writeJson(MANIFEST_PATH, manifest);
    console.log(`已删除 ${doc}`);
}

// 各服务从同一队列取文章，整篇生成完才写入；预算不足或额度耗尽的服务停下，文章留给其他服务或下次运行
const queue = [...changed];
async function work(p) {
    while (queue.length) {
        const d = queue.shift();
        const texts = d.chunks.map((c) => c.embedText);
        if (!p.canAfford(texts.reduce((n, t) => n + t.length, 0))) {
            queue.unshift(d);
            console.log(`${p.name} 已到预算，停止`);
            return;
        }
        let vectors;
        try {
            vectors = await embedDoc(p, texts);
        } catch (err) {
            queue.unshift(d);
            if (err instanceof QuotaExhausted) {
                console.log(`${p.name} 当日额度已用完，停止`);
                return;
            }
            throw err;
        }

        // 序号连续，新块覆盖同序号的旧块，多出来的旧块要删
        const stale = indexedIds(d.doc).slice(d.chunks.length);
        if (stale.length) await deleteIds(stale);

        await upsert(d, vectors);
        manifest.docs[d.doc] = { group: d.group, hash: d.hash, metaHash: d.metaHash, chunks: d.chunks.length };
        writeJson(MANIFEST_PATH, manifest);
        console.log(`[${p.name}] 已写入 ${d.doc}《${d.title}》${d.chunks.length} 块，剩 ${queue.length} 篇`);
    }
}
const results = await Promise.allSettled(embedders.map(work));
console.log(embedders.map((p) => p.summary()).join('；'));
const failed = results.find((r) => r.status === 'rejected');
if (failed) throw failed.reason;
if (queue.length) {
    const rest = queue.reduce((n, d) => n + d.chunks.length, 0);
    console.log(`还有 ${queue.length} 篇（${rest} 块）未生成向量，额度恢复后（北京时间 8 点后）再运行同一命令即可继续。`);
}

for (const d of metaOnly) {
    // 正文未变则块 id 不变，从 Qdrant 取回已有向量
    const ids = d.chunks.map((c) => c.id);
    const values = await getVectors(q, ids);
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
