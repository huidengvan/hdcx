/**
 * AI 语义搜索 API 服务（Cloudflare Worker：workers/rag-api）
 */
import ragConfig from '@site/rag/categories.json';

const RAG_API_URL = 'https://ragapi.hdcxb.net';

export const ragCategories = ragConfig.categories;

/**
 * @typedef {Object} RagHit
 * @property {number} pStart
 * @property {number} pEnd
 * @property {string} section
 * @property {number} score
 * @property {string} text
 * @property {string} href - 形如 /books/b1/1-01?hl=12-14#p12
 */

/**
 * @typedef {Object} RagDoc
 * @property {string} doc
 * @property {string} url
 * @property {string} title
 * @property {string} group
 * @property {string} groupLabel
 * @property {number} score
 * @property {RagHit[]} hits
 */

/**
 * 执行 AI 语义搜索
 * @param {string} q
 * @param {string[]} groups - 册筛选，空数组表示全部
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ q: string, tookMs: number, results: RagDoc[] }>}
 */
export async function ragSearch(q, groups = [], signal) {
    const params = new URLSearchParams({ q });
    if (groups.length) params.set('g', groups.join(','));

    const response = await fetch(`${RAG_API_URL}/search?${params}`, { signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || `AI 搜索请求失败: ${response.status}`);
    }
    return data;
}

// 疑问词等虚词不参与高亮
const STOP_TERMS = new Set(['什么', '怎么', '怎样', '如何', '为什么', '是什么', '有什么', '哪些', '可以', '应该', '我们', '自己', '一个', '这个', '那个']);

/**
 * 从查询中找出在原文里出现过的字面片段（≥2 字，优先最长）
 * @param {string} q
 * @param {string} text
 * @returns {string[]}
 */
export function matchedTerms(q, text) {
    const query = (q || '').replace(/[\s，。？！、,.?!]+/g, '');
    const terms = new Set();
    for (let i = 0; i < query.length; i++) {
        for (let len = 2; len <= 8 && i + len <= query.length; len++) {
            const sub = query.slice(i, i + len);
            // 跳过疑问词及首尾为虚词的片段，如“的目”“菩提心的”（“目的”保留）
            if ([...STOP_TERMS].some((w) => sub.includes(w)) || /^[的了吗呢么是和与及]|[了吗呢么是和与及]$|..+的$/.test(sub)) continue;
            if (text.includes(sub)) terms.add(sub);
        }
    }
    return [...terms];
}

/**
 * 把命中文本拆成段落 → 句子，并标记含查询关键词的句子
 * @param {string} text
 * @param {string[]} terms
 * @returns {{ text: string, hit: boolean }[][]} 段落数组，每段为句子数组
 */
export function splitSentences(text, terms) {
    return text.split('\n').map((para) =>
        (para.match(/[^。！？；]+[。！？；]*[”’」』）)]*|[。！？；]+/g) || [para]).map((sentence) => ({
            text: sentence,
            hit: terms.some((t) => sentence.includes(t)),
        })),
    );
}

const SNIPPET_CHARS = 150;

/**
 * 折叠状态的摘要：以第一个含关键词的句子为中心取约 150 字，前后被截断时加省略号
 * @param {{ text: string, hit: boolean }[][]} paragraphs
 * @returns {{ sentences: { text: string, hit: boolean }[], head: boolean, tail: boolean }}
 */
export function buildSnippet(paragraphs) {
    const flat = paragraphs.flat();
    const center = Math.max(0, flat.findIndex((s) => s.hit));
    let start = center > 0 ? center - 1 : 0;
    let end = center + 1;
    let len = flat.slice(start, end).reduce((n, s) => n + s.text.length, 0);
    while (end < flat.length && len < SNIPPET_CHARS) len += flat[end++].text.length;
    while (start > 0 && len < SNIPPET_CHARS) len += flat[--start].text.length;
    return { sentences: flat.slice(start, end), head: start > 0, tail: end < flat.length };
}

/**
 * 相关度分数映射为 1~5 级
 * rerank：bge-reranker-base 0~1，相关段落通常 0.8~0.99；dense（重排不可用时）：余弦相似度 0.5~0.75
 * @param {number} score
 * @param {'rerank' | 'dense'} [ranker]
 */
export function relevanceLevel(score, ranker = 'rerank') {
    const steps = ranker === 'dense' ? [0.68, 0.63, 0.58, 0.54] : [0.98, 0.9, 0.75, 0.6];
    return 5 - steps.filter((t) => score < t).length;
}
