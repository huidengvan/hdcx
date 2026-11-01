/**
 * hdcx RAG 语义搜索 API
 * GET /search?q=关键词&g=books/b1,books/b4&c=books
 *   g：按册（group）筛选，优先于 c；c：按分类筛选；都不传则搜索全部
 * GET /meta：分类配置
 */
import config from '../../../rag/categories.json';

const EMBED_MODEL = '@cf/baai/bge-m3';
const RERANK_MODEL = '@cf/baai/bge-reranker-base';
const MAX_QUERY_CHARS = 100;

const groupInfo = new Map(config.categories.flatMap((c) => c.groups.map((g) => [g.id, { ...g, cat: c.id }])));
const catIds = new Set(config.categories.map((c) => c.id));

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin) return {};
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    // 本地开发：localhost / 127.0.0.1 / 局域网地址
    const isDev = env.ALLOW_DEV_ORIGINS === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (!allowed.includes(origin) && !isDev) return {};
    return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
}

const json = (data, status, headers) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

const parseList = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

// 去掉疑问词与标点，剩下的片段（≥2 字）作为关键词，如“什么是出离心” → ["出离心"]
const QUESTION_WORDS = /什么是|是什么|什么叫做?|为什么|什么|怎么样|怎么|怎样|如何|哪些|有没有|是否|吗|呢|吧|[？?！!，,。.、\s]/g;
const coreTerms = (q) => q.replace(QUESTION_WORDS, ' ').split(' ').filter((t) => t.length >= 2);

const countOccurrences = (text, term) => text.split(term).length - 1;

// 关键词加分：出现即加 KEYWORD_BONUS，每多出现一次再加 0.01，最多再加 0.03，弥补短问题的纯语义召回不足
function keywordBonus(text, terms, bonus) {
    const total = terms.reduce((n, t) => n + countOccurrences(text, t), 0);
    return total ? bonus + 0.01 * Math.min(total - 1, 3) : 0;
}

// 重排：交叉编码器逐段判断与问题的相关度（0~1），区分度远高于向量余弦相似度
async function rerank(matches, q, env) {
    const contexts = matches.map((m) => ({ text: `${m.metadata.title} ${m.metadata.section}
${m.metadata.text}` }));
    const { response } = await env.AI.run(RERANK_MODEL, { query: q, contexts });
    return response.map(({ id, score }) => ({ ...matches[id].metadata, score })).sort((a, b) => b.score - a.score);
}

// 重排不可用时的回退：向量相似度 + 关键词加分，阈值取 max(MIN_SCORE, 第一名 - REL_GAP)
function denseScore(matches, q, env) {
    const bonus = Number(env.KEYWORD_BONUS);
    const terms = coreTerms(q);
    const scored = matches
        .map((m) => ({ ...m.metadata, score: m.score + keywordBonus(m.metadata.text, terms, bonus) }))
        .sort((a, b) => b.score - a.score);
    const cutoff = scored.length ? Math.max(Number(env.MIN_SCORE), scored[0].score - Number(env.REL_GAP)) : 0;
    return scored.filter((m) => m.score >= cutoff);
}

// 按文章分组 → 文章内按分数降序（scored 已按分数降序且已过阈值）
function groupResults(scored, env) {
    const maxHits = Number(env.MAX_HITS_PER_DOC);
    const maxDocs = Number(env.MAX_DOCS);

    const docs = new Map();
    for (const m of scored) {
        if (!docs.has(m.doc)) {
            if (docs.size >= maxDocs) continue;
            docs.set(m.doc, { doc: m.doc, url: m.url, title: m.title, group: m.group, groupLabel: groupInfo.get(m.group)?.label || m.group, score: m.score, hits: [] });
        }
        docs.get(m.doc).hits.push({ pStart: m.pStart, pEnd: m.pEnd, section: m.section, score: m.score, text: m.text });
    }

    // 各命中块保持独立（每块 2~3 段），保证跳转定位精确
    return [...docs.values()].map((d) => {
        const hits = d.hits
            .slice(0, maxHits)
            .map((h) => ({ ...h, score: Number(h.score.toFixed(4)), href: `${d.url}?hl=${h.pStart}-${h.pEnd}#p${h.pStart}` }));
        return { ...d, score: Number(d.score.toFixed(4)), hits };
    });
}

async function search(url, env) {
    const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
    if (!q) return [400, { error: '缺少查询内容' }];
    if (q.length > MAX_QUERY_CHARS) return [400, { error: `查询内容不能超过 ${MAX_QUERY_CHARS} 字` }];

    const groups = parseList(url.searchParams.get('g')).filter((g) => groupInfo.has(g));
    const cats = parseList(url.searchParams.get('c')).filter((c) => catIds.has(c));
    const filter = groups.length ? { group: { $in: groups } } : cats.length ? { cat: { $in: cats } } : undefined;

    const started = Date.now();
    const embedding = await env.AI.run(EMBED_MODEL, { text: [q] });
    const vector = (embedding.data || embedding.response)[0];
    const { matches } = await env.VECTORIZE.query(vector, { topK: Number(env.TOP_K), returnMetadata: 'all', ...(filter ? { filter } : {}) });
    if (!matches.length) return [200, { q, tookMs: Date.now() - started, ranker: 'none', results: [] }];

    let scored;
    let ranker = 'rerank';
    try {
        scored = (await rerank(matches, q, env)).filter((m) => m.score >= Number(env.RERANK_MIN));
    } catch (err) {
        console.error('rerank failed, fallback to dense', err);
        ranker = 'dense';
        scored = denseScore(matches, q, env);
    }

    return [200, { q, tookMs: Date.now() - started, ranker, results: groupResults(scored, env) }];
}

export default {
    async fetch(request, env, ctx) {
        const cors = corsHeaders(request, env);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Max-Age': '86400' } });
        if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405, cors);

        const url = new URL(request.url);
        if (url.pathname === '/meta') return json(config, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' });
        if (url.pathname !== '/search') return json({ error: 'Not Found' }, 404, cors);

        // 结果缓存：规范化参数并带上索引版本，重建索引后改 INDEX_VERSION 即可失效
        const cacheUrl = new URL('https://rag-cache.internal/search');
        cacheUrl.searchParams.set('v', env.INDEX_VERSION);
        for (const k of ['q', 'g', 'c']) {
            const v = url.searchParams.get(k);
            if (v) cacheUrl.searchParams.set(k, k === 'q' ? v.replace(/\s+/g, ' ').trim() : parseList(v).sort().join(','));
        }
        const cacheKey = new Request(cacheUrl.toString());
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) return new Response(cached.body, { headers: { ...Object.fromEntries(cached.headers), ...cors, 'X-Cache': 'HIT' } });

        try {
            const [status, data] = await search(url, env);
            const res = json(data, status, { 'Cache-Control': `public, max-age=${env.CACHE_TTL}` });
            if (status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
            return new Response(res.body, { status, headers: { ...Object.fromEntries(res.headers), ...cors } });
        } catch (err) {
            console.error(err);
            return json({ error: 'AI 搜索暂不可用，请稍后重试' }, 503, cors);
        }
    },
};
