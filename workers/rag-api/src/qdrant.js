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
 * 一次请求执行多组检索，合并去重（同一点取最高分），按分数降序
 * @param {number[]} vector
 * @param {{ limit: number, filter?: { key: string, values: string[] }[] }[]} searches filter 各条件同时满足，每个条件匹配字段（group / cat）任一值
 */
export async function queryPoints(env, vector, searches) {
    const result = await qdrant(env, '/points/query/batch', {
        searches: searches.map(({ limit, filter }) => ({
            query: vector,
            limit,
            with_payload: true,
            ...(filter?.length ? { filter: { must: filter.map((f) => ({ key: f.key, match: { any: f.values } })) } } : {}),
        })),
    });
    const merged = new Map();
    for (const { points } of result) {
        for (const p of points) {
            const m = toMatch(p);
            if (!merged.has(m.id) || merged.get(m.id).score < m.score) merged.set(m.id, m);
        }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score);
}

export async function getPoints(env, cids) {
    const ids = await Promise.all(cids.map(pointId));
    return (await qdrant(env, '/points', { ids, with_payload: true })).map(toMatch);
}
