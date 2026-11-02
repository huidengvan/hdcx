/**
 * Qdrant 向量库操作（REST）。
 * 点 id 须为整数或 UUID，这里由块 id（如 books/b1/1-01#003）的 SHA-1 派生 UUID，原 id 存在 payload.cid。
 * 接口（workers/rag-api）用同样的规则计算 UUID，见 pointId。
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, DIMENSIONS } from './lib.mjs';

const UPSERT_BATCH = 100;
const GET_BATCH = 100;

export function pointId(cid) {
    const h = createHash('sha1').update(cid).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function loadQdrant() {
    process.loadEnvFile(path.join(ROOT, '.env.local'));
    const { QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION } = process.env;
    if (!QDRANT_URL || !QDRANT_API_KEY) throw new Error('缺少 QDRANT_URL / QDRANT_API_KEY，请在 .env.local 中配置');
    return { url: QDRANT_URL.replace(/\/+$/, ''), key: QDRANT_API_KEY, collection: QDRANT_COLLECTION || 'hdcx' };
}

// 网络错误、429、5xx 退避重试
export async function qFetch(q, apiPath, { method = 'GET', body, allow404 = false } = {}) {
    for (let attempt = 1; ; attempt++) {
        let res;
        try {
            res = await fetch(`${q.url}${apiPath}`, {
                method,
                headers: { 'api-key': q.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
        } catch (err) {
            if (attempt < 5) {
                console.warn(`网络错误，${2 ** attempt} 秒后重试（${err.cause?.code || err.message}）`);
                await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
                continue;
            }
            throw err;
        }
        if (allow404 && res.status === 404) return null;
        const json = await res.json().catch(() => null);
        if (res.ok) return json?.result;
        if ((res.status === 429 || res.status >= 500) && attempt < 5) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
        }
        throw new Error(`${method} ${apiPath} → ${res.status} ${json?.status?.error || res.statusText}`);
    }
}

const col = (q) => `/collections/${q.collection}`;

// 创建 collection 与过滤字段索引，可重复执行：1024 维余弦；原始向量与正文 payload 存磁盘，内存只放 int8 量化副本
// （免费集群 1 GB 内存与其他项目共用，原始向量常驻内存时约 4 KB / 个）
export async function ensureCollection(q) {
    const existing = await qFetch(q, col(q), { allow404: true });
    if (existing) {
        const { size, on_disk } = existing.config.params.vectors;
        if (size !== DIMENSIONS) throw new Error(`collection ${q.collection} 维度为 ${size}，期望 ${DIMENSIONS}`);
        if (!on_disk) {
            await qFetch(q, col(q), { method: 'PATCH', body: { vectors: { '': { on_disk: true } } } });
            console.log(`collection ${q.collection} 原始向量已改为存磁盘`);
        }
    } else {
        await qFetch(q, col(q), {
            method: 'PUT',
            body: {
                vectors: { size: DIMENSIONS, distance: 'Cosine', on_disk: true },
                quantization_config: { scalar: { type: 'int8', always_ram: true } },
                on_disk_payload: true,
            },
        });
        console.log(`已创建 collection ${q.collection}`);
    }
    for (const field of ['cat', 'group', 'doc']) {
        await qFetch(q, `${col(q)}/index?wait=true`, { method: 'PUT', body: { field_name: field, field_schema: 'keyword' } });
    }
    return existing ? 'exists' : 'created';
}

/** @param {{ cid: string, vector: number[], payload: object }[]} points */
export async function upsertPoints(q, points) {
    for (let i = 0; i < points.length; i += UPSERT_BATCH) {
        await qFetch(q, `${col(q)}/points?wait=true`, {
            method: 'PUT',
            body: { points: points.slice(i, i + UPSERT_BATCH).map((p) => ({ id: pointId(p.cid), vector: p.vector, payload: { ...p.payload, cid: p.cid } })) },
        });
    }
}

export async function deletePoints(q, cids) {
    for (let i = 0; i < cids.length; i += UPSERT_BATCH) {
        await qFetch(q, `${col(q)}/points/delete?wait=true`, { method: 'POST', body: { points: cids.slice(i, i + UPSERT_BATCH).map(pointId) } });
    }
}

// 按块 id 取回已有向量，返回 Map(cid -> vector)
export async function getVectors(q, cids) {
    const out = new Map();
    for (let i = 0; i < cids.length; i += GET_BATCH) {
        const got = await qFetch(q, `${col(q)}/points`, {
            method: 'POST',
            body: { ids: cids.slice(i, i + GET_BATCH).map(pointId), with_vector: true, with_payload: ['cid'] },
        });
        for (const p of got) out.set(p.payload.cid, p.vector);
    }
    return out;
}

export async function countPoints(q) {
    return (await qFetch(q, `${col(q)}/points/count`, { method: 'POST', body: { exact: true } })).count;
}
