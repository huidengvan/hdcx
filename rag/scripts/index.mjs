/**
 * 切块 → Workers AI 生成向量 → 写入 Vectorize，并维护 rag/manifest.json 做增量更新。
 * 文章内容（切块结果）有变化时整篇替换：先删旧向量再写新向量，因为段落编号可能整体位移。
 *
 * 用法：node rag/scripts/index.mjs [--only books/b4] [--dry-run] [--full]
 */
import { buildChunks, printStats } from './build-chunks.mjs';
import { EMBED_MODEL, MANIFEST_PATH, loadEnv, cfFetch, parseArgs, matchOnly, readJson, writeJson } from './lib.mjs';

const EMBED_BATCH = 20;
const UPSERT_BATCH = 100;

const { only, 'dry-run': dryRun, full } = parseArgs();
const docs = buildChunks({ only });
printStats(docs);

const manifest = readJson(MANIFEST_PATH, { model: EMBED_MODEL, docs: {} });
const changed = docs.filter((d) => full || manifest.docs[d.doc]?.hash !== d.hash);
const present = new Set(docs.map((d) => d.doc));
// 本次范围内已不存在的文章
const removed = Object.keys(manifest.docs).filter((doc) => matchOnly(only, doc) && !present.has(doc));

console.log(`需更新 ${changed.length} 篇（${changed.reduce((n, d) => n + d.chunks.length, 0)} 块），需删除 ${removed.length} 篇`);
if (dryRun || (!changed.length && !removed.length)) process.exit(0);

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

    const lines = d.chunks.map(({ id, embedText, ...metadata }, i) => JSON.stringify({ id, values: vectors[i], metadata }));
    for (let i = 0; i < lines.length; i += UPSERT_BATCH) {
        await cfFetch(env, `${base}/upsert`, {
            method: 'POST',
            contentType: 'application/x-ndjson',
            body: lines.slice(i, i + UPSERT_BATCH).join('\n'),
        });
    }

    manifest.docs[d.doc] = { hash: d.hash, ids: [...newIds] };
    writeJson(MANIFEST_PATH, manifest);
    console.log(`已写入 ${d.doc}《${d.title}》${d.chunks.length} 块`);
}

console.log('完成。Vectorize 写入为异步，通常数秒到一分钟后可查询。');
