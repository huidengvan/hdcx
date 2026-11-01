/**
 * 初始化 Qdrant collection（1024 维余弦 + int8 量化）及过滤字段索引（cat / group / doc），可重复执行。
 * pnpm rag:index 首次写入时也会自动调用。
 *
 * 用法：node rag/scripts/setup-index.mjs
 */
import { loadQdrant, ensureCollection, countPoints } from './qdrant.mjs';

const q = loadQdrant();
const state = await ensureCollection(q);
console.log(`collection ${q.collection} ${state === 'created' ? '已创建' : '已存在'}，当前 ${await countPoints(q)} 个点`);
