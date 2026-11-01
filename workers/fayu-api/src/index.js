/**
 * 法语字幕搜索 API（D1 数据库 fayu，表结构见 schema.sql）
 * GET /search?q=菩提心 慈悲心&page=1&size=10&b=b1,b2
 *   q：关键词，空格分隔为多个词（须在同一段话内同时出现）；b：按册筛选
 *   返回 { terms, total（视频数）, matches（匹配处数）, facets（各册视频数，不受 b 影响）, results }
 * GET /meta：数据版本与各册视频数
 * GET /search/:keyword/:page：旧接口，返回旧格式（subtitles 为 JSON 字符串），供未更新的前端使用
 *
 * 检索分两步：① SQL 用 instr 在规范化文本上筛出含全部关键词的块，统计各视频匹配处数并排序分页
 * ② 只取回当前页视频的命中块，在 JS 中定位命中行、取上下文、计算高亮区间
 */
import { parseTerms } from './normalize.js';
import { lineStarts, matchText, renderGroups } from './search.js';

const MAX_QUERY_CHARS = 50;
const MAX_TERMS = 6;
const MAX_PAGE_SIZE = 20;
const LEGACY_PAGE_SIZE = 5;
const META_TTL_MS = 60_000;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (data, status = 200, headers = {}) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers } });

// 数据版本与视频列表缓存在 isolate 内存，每分钟核对一次版本（读 1 行），版本变化才重新读视频列表
let metaCache = null;

async function getMeta(env) {
    if (metaCache && Date.now() - metaCache.checkedAt < META_TTL_MS) return metaCache;
    const { results } = await env.DB.prepare('SELECT name, value FROM meta').all();
    const info = Object.fromEntries(results.map((r) => [r.name, r.value]));
    if (!metaCache || metaCache.version !== info.version) {
        const { results: videos } = await env.DB.prepare('SELECT id, book, series, title, cues FROM videos ORDER BY id').all();
        metaCache = { version: info.version || '', updatedAt: info.updated_at || '', videos: new Map(videos.map((v) => [v.id, v])) };
    }
    metaCache.checkedAt = Date.now();
    return metaCache;
}

const placeholders = (n, from) => Array.from({ length: n }, (_, i) => `?${from + i}`).join(', ');

/**
 * @param {{ terms: string[], books: string[], page: number, pageSize: number }} query
 */
async function search(env, meta, { terms, books, page, pageSize }) {
    const near = Number(env.NEAR_CHARS);
    const where = terms.map((_, i) => `instr(norm, ?${i + 1}) > 0`).join(' AND ');

    // ① 各视频匹配处数：单个词直接由 SQL 计数；多个词要判断是否相距 near 字以内，取回候选块的 norm 在 JS 中计算
    const counts = new Map();
    if (terms.length === 1) {
        const { results } = await env.DB.prepare(
            `SELECT video_id AS id, SUM((length(norm) - length(replace(norm, ?1, ''))) / length(?1)) AS c FROM cue_blocks WHERE ${where} GROUP BY video_id`,
        )
            .bind(terms[0])
            .all();
        for (const r of results) counts.set(r.id, r.c);
    } else {
        const { results } = await env.DB.prepare(`SELECT video_id AS id, norm FROM cue_blocks WHERE ${where}`)
            .bind(...terms)
            .all();
        for (const r of results) {
            const c = matchText(r.norm, terms, near).matches.length;
            if (c) counts.set(r.id, (counts.get(r.id) || 0) + c);
        }
    }

    const facets = {};
    const ranked = [];
    for (const [id, count] of counts) {
        const v = meta.videos.get(id);
        if (!v) continue;
        facets[v.book] = (facets[v.book] || 0) + 1;
        if (!books.length || books.includes(v.book)) ranked.push({ v, count });
    }
    // 匹配处数多的在前，相同时按课程顺序
    ranked.sort((a, b) => b.count - a.count || a.v.id - b.v.id);
    const pageItems = ranked.slice((page - 1) * pageSize, page * pageSize);

    // ② 当前页视频的命中块 → 命中行 ± 上下文
    const results = [];
    if (pageItems.length) {
        const ids = pageItems.map((x) => x.v.id);
        const { results: blocks } = await env.DB.prepare(
            `SELECT video_id AS id, first_cue, starts, texts, norm, norm_lens FROM cue_blocks WHERE video_id IN (${placeholders(ids.length, terms.length + 1)}) AND ${where} ORDER BY video_id, seq`,
        )
            .bind(...terms, ...ids)
            .all();

        const context = Number(env.CONTEXT_LINES);
        const maxLines = Number(env.MAX_LINES);
        for (const { v, count } of pageItems) {
            const groups = [];
            let budget = maxLines;
            for (const row of blocks) {
                if (row.id !== v.id || budget <= 0) continue;
                const block = {
                    first: row.first_cue,
                    norm: row.norm,
                    lineStart: lineStarts(row.norm_lens.split(',').map(Number)),
                    starts: row.starts.split(',').map(Number),
                    texts: row.texts.split('\n'),
                };
                for (const g of renderGroups(block, matchText(block.norm, terms, near), terms, context, budget)) {
                    groups.push(g);
                    budget -= g.length;
                }
            }
            results.push({ book: v.book, series: v.series, title: v.title, count, groups });
        }
    }

    return {
        total: ranked.length,
        matches: ranked.reduce((n, x) => n + x.count, 0),
        facets,
        results,
    };
}

function parseQuery(raw, books) {
    const q = (raw || '').replace(/\s+/g, ' ').trim();
    if (!q) return { error: '缺少关键词' };
    if (q.length > MAX_QUERY_CHARS) return { error: `关键词不能超过 ${MAX_QUERY_CHARS} 字` };
    const terms = parseTerms(q, MAX_TERMS);
    if (!terms.length) return { error: '关键词需包含文字或数字' };
    return { q, terms, books };
}

// 带结果缓存的搜索：缓存键为规范化后的查询 + 数据版本，重新导入后自动失效
async function cachedSearch(env, ctx, query, page, pageSize) {
    const meta = await getMeta(env);
    const key = new URL('https://fayu-cache.internal/search');
    key.searchParams.set('v', meta.version);
    key.searchParams.set('t', query.terms.join('|'));
    key.searchParams.set('b', [...query.books].sort().join(','));
    key.searchParams.set('p', String(page));
    key.searchParams.set('s', String(pageSize));
    key.searchParams.set('near', env.NEAR_CHARS);
    const cacheKey = new Request(key.toString());
    const cached = await caches.default.match(cacheKey);
    if (cached) return { data: await cached.json(), hit: true };

    const started = Date.now();
    const data = { q: query.q, terms: query.terms, page, pageSize, ...(await search(env, meta, { ...query, page, pageSize })) };
    data.tookMs = Date.now() - started;
    const res = new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${env.CACHE_TTL}` } });
    ctx.waitUntil(caches.default.put(cacheKey, res));
    return { data, hit: false };
}

const pad = (n) => String(n).padStart(2, '0');
const legacyTime = (t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}.000`;

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
        if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);

        // 数据库开启了读副本，经 Sessions API 才会就近读副本；否则每次查询都要回到亚太区的主库（国内访问常落在美国节点）
        env = { ...env, DB: env.DB.withSession('first-unconstrained') };

        const url = new URL(request.url);
        const segments = url.pathname.split('/').filter(Boolean);
        const clientCache = { 'Cache-Control': `public, max-age=${env.CLIENT_CACHE_TTL}` };

        try {
            if (url.pathname === '/meta') {
                const meta = await getMeta(env);
                const books = {};
                for (const v of meta.videos.values()) books[v.book] = (books[v.book] || 0) + 1;
                return json({ version: meta.version, updatedAt: meta.updatedAt, videos: meta.videos.size, books }, 200, clientCache);
            }

            if (url.pathname === '/search') {
                const p = url.searchParams;
                const books = (p.get('b') || '').split(',').filter((b) => /^b\d+$/.test(b));
                const query = parseQuery(p.get('q'), books);
                if (query.error) return json({ error: query.error }, 400);
                const page = Math.max(1, parseInt(p.get('page'), 10) || 1);
                const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(p.get('size'), 10) || Number(env.PAGE_SIZE)));
                const { data, hit } = await cachedSearch(env, ctx, query, page, pageSize);
                return json(data, 200, { ...clientCache, 'X-Cache': hit ? 'HIT' : 'MISS' });
            }

            // 旧接口 /search/:keyword/:page
            if (segments[0] === 'search' && segments.length >= 2) {
                let raw = segments[1];
                try {
                    raw = decodeURIComponent(raw);
                } catch {}
                const page = Math.max(1, parseInt(segments[2], 10) || 1);
                const query = parseQuery(raw, []);
                if (query.error) return json({ total: 0, pageSize: LEGACY_PAGE_SIZE, page, data: [] }, 200, clientCache);
                const { data } = await cachedSearch(env, ctx, query, page, LEGACY_PAGE_SIZE);
                const legacy = data.results.map((r) => ({
                    count: r.count,
                    title: r.title,
                    series: r.series,
                    subtitles: JSON.stringify(r.groups.flat().map((l) => ({ lineId: l.n, startTime: legacyTime(l.t), text: l.text }))),
                }));
                return json({ total: data.total, pageSize: LEGACY_PAGE_SIZE, page, data: legacy }, 200, clientCache);
            }

            return json({ name: 'fayu-search', endpoints: ['/search?q=&page=&size=&b=', '/meta'] });
        } catch (err) {
            console.error(err);
            return json({ error: '字幕搜索暂不可用，请稍后重试' }, 500);
        }
    },
};
