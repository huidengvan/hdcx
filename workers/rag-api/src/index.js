/**
 * hdcx RAG 语义搜索 API
 * GET /search?q=关键词&g=books/b1,books/b4&c=books
 *   g：按册（group）筛选，优先于 c；c：按分类筛选；都不传则搜索全部
 * GET /meta：分类配置
 */
import config from '../../../rag/categories.json';
import { QUESTION_WORDS, queryBigrams, focusText } from './focus.js';

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
const coreTerms = (q) => q.replace(QUESTION_WORDS, ' ').split(' ').filter((t) => t.length >= 2);

const countOccurrences = (text, term) => text.split(term).length - 1;

// 关键词加分：出现即加 KEYWORD_BONUS，每多出现一次再加 0.01，最多再加 0.03，弥补短问题的纯语义召回不足
function keywordBonus(text, terms, bonus) {
    const total = terms.reduce((n, t) => n + countOccurrences(text, t), 0);
    return total ? bonus + 0.01 * Math.min(total - 1, 3) : 0;
}

// 跨分类去重（重复关系由 rag/scripts/dedupe.mjs 建索引时标注）：
// 候选带 dupOf 且其对应的优先分类块在本次搜索范围内时，用对应块替换；对应块不在候选中则按 id 取回
async function dedupe(matches, inScope, env) {
    const byId = new Map(matches.map((m) => [m.id, m]));
    const kept = [];
    const missing = [];
    for (const m of matches) {
        const { dupOf, dupGroup } = m.metadata;
        if (!dupOf || !inScope(dupGroup)) {
            kept.push(m);
        } else if (!byId.has(dupOf) && !missing.includes(dupOf)) {
            missing.push(dupOf);
        }
    }
    if (missing.length) {
        const fetched = await env.VECTORIZE.getByIds(missing);
        for (const v of fetched) if (!byId.has(v.id)) kept.push({ id: v.id, score: 0, metadata: v.metadata });
    }
    return kept;
}

// 「亦见于」：被重复块的 alsoIn（JSON 字符串）
function alsoInOf(md) {
    try {
        return md.alsoIn ? JSON.parse(md.alsoIn) : [];
    } catch {
        return [];
    }
}

const articleOf = (md) => md.article || md.title;
const hrefOf = (md) => `${md.url}?hl=${md.pStart}-${md.pEnd}#p${md.pStart}`;

// 重排：交叉编码器逐段判断与问题的相关度（0~1），区分度远高于向量余弦相似度
// 模型单段上限 512 token，长块以关键句为中心截取 RERANK_CHARS 字，避免后半段被截掉
async function rerank(matches, q, env) {
    const grams = queryBigrams(q);
    const budget = Number(env.RERANK_CHARS);
    const contexts = matches.map((m) => ({ text: `${articleOf(m.metadata)} ${m.metadata.section}\n${focusText(m.metadata.text, grams, budget)}` }));
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

const groupLabelOf = (group) => groupInfo.get(group)?.label || group;

// 按文章分组 → 文章内按分数降序（scored 已按分数降序且已过阈值）
// 文章 = 文档本身，整册单文件的书（慧灯之光）为其中的二级标题，因此分组键为「文档 + 文章名」
function groupResults(scored, env) {
    const maxHits = Number(env.MAX_HITS_PER_DOC);
    const maxDocs = Number(env.MAX_DOCS);

    const docs = new Map();
    for (const m of scored) {
        const key = `${m.doc}|${articleOf(m)}`;
        if (!docs.has(key)) {
            if (docs.size >= maxDocs) continue;
            docs.set(key, { doc: key, url: m.url, title: articleOf(m), group: m.group, groupLabel: groupLabelOf(m.group), score: m.score, hits: [] });
        }
        // 同一文章被拆成多块时只列一次，链接到第一块
        const alsoIn = [];
        for (const a of alsoInOf(m)) {
            const label = `${groupLabelOf(a.group)}《${articleOf(a)}》`;
            if (!alsoIn.some((x) => x.label === label)) alsoIn.push({ label, href: hrefOf(a) });
        }
        docs.get(key).hits.push({ pStart: m.pStart, pEnd: m.pEnd, section: m.section, score: m.score, text: m.text, ...(alsoIn.length ? { alsoIn } : {}) });
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
    const result = await env.VECTORIZE.query(vector, { topK: Number(env.TOP_K), returnMetadata: 'all', ...(filter ? { filter } : {}) });
    if (!result.matches.length) return [200, { q, tookMs: Date.now() - started, ranker: 'none', results: [] }];
    // 先去重再重排：重复内容不占重排名额，也省 Neurons
    const inScope = (group) => (groups.length ? groups.includes(group) : cats.length ? cats.includes(groupInfo.get(group)?.cat) : true);
    const matches = await dedupe(result.matches, inScope, env);

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
