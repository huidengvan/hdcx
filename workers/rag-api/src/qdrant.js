/**
 * Qdrant 检索（REST）。点 id 由块 id 的 SHA-1 派生 UUID，与 rag/scripts/qdrant.mjs 的 pointId 一致；原块 id 在 payload.cid。
 * QDRANT_URL / QDRANT_API_KEY 为 Worker secret，QDRANT_COLLECTION 为 vars。
 */

export async function pointId(cid) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(cid));
    const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function qdrant(env, path, body) {
    const res = await fetch(`${env.QDRANT_URL.replace(/\/+$/, '')}/collections/${env.QDRANT_COLLECTION}${path}`, {
        method: 'POST',
        headers: { 'api-key': env.QDRANT_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant ${path} → ${res.status} ${await res.text()}`);
    return (await res.json()).result;
}

// 统一为 { id, score, metadata }，与原 Vectorize 返回结构一致
const toMatch = (p) => ({ id: p.payload.cid, score: p.score ?? 0, metadata: p.payload });

/**
 * @param {number[]} vector
 * @param {{ key: string, values: string[] } | undefined} filter 按 payload 字段（group / cat）匹配任一值
 */
export async function queryPoints(env, vector, limit, filter) {
    const result = await qdrant(env, '/points/query', {
        query: vector,
        limit,
        with_payload: true,
        ...(filter ? { filter: { must: [{ key: filter.key, match: { any: filter.values } }] } } : {}),
    });
    return result.points.map(toMatch);
}

export async function getPoints(env, cids) {
    const ids = await Promise.all(cids.map(pointId));
    return (await qdrant(env, '/points', { ids, with_payload: true })).map(toMatch);
}
