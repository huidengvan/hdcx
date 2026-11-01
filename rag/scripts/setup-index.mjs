/**
 * 一次性初始化 Vectorize 索引与过滤用的 metadata 索引（可重复执行）。
 * metadata 索引必须在写入向量之前创建，否则已有向量不参与过滤。
 *
 * 用法：node rag/scripts/setup-index.mjs
 */
import { DIMENSIONS, loadEnv, cfFetch } from './lib.mjs';

const METADATA_PROPS = ['cat', 'group'];

const env = loadEnv();
const base = `/vectorize/v2/indexes/${env.indexName}`;

const existing = await cfFetch(env, base, { allow404: true });
if (existing) {
    console.log(`索引 ${env.indexName} 已存在（${existing.config.dimensions} 维，${existing.config.metric}）`);
    if (existing.config.dimensions !== DIMENSIONS) throw new Error(`维度不符，期望 ${DIMENSIONS}`);
} else {
    await cfFetch(env, '/vectorize/v2/indexes', {
        method: 'POST',
        body: { name: env.indexName, description: 'hdcx RAG 语义搜索（bge-m3）', config: { dimensions: DIMENSIONS, metric: 'cosine' } },
    });
    console.log(`已创建索引 ${env.indexName}`);
}

const list = await cfFetch(env, `${base}/metadata_index/list`);
const have = new Set((list?.metadataIndexes || []).map((m) => m.propertyName));
for (const prop of METADATA_PROPS) {
    if (have.has(prop)) {
        console.log(`metadata 索引 ${prop} 已存在`);
        continue;
    }
    await cfFetch(env, `${base}/metadata_index/create`, { method: 'POST', body: { propertyName: prop, indexType: 'string' } });
    console.log(`已创建 metadata 索引 ${prop}`);
}
