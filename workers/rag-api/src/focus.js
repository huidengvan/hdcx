/**
 * 重排模型（bge-reranker-base）单段输入上限 512 token，约 500 字，长块后半段会被截掉。
 * 这里按与查询的字面重合度找出关键句，以它为中心截取不超过 budget 字的片段送去重排。
 */

// 疑问词与标点，不参与重合度计算
export const QUESTION_WORDS = /什么是|是什么|什么叫做?|为什么|什么|怎么样|怎么|怎样|如何|哪些|有没有|是否|吗|呢|吧|[？?！!，,。.、\s]/g;

// 查询去掉疑问词后的二元字组，如“放生怎样才算大乘法” → 放生 / 才算 / 算大 / 大乘 / 乘法 …
export function queryBigrams(q) {
    const s = q.replace(QUESTION_WORDS, '');
    const grams = new Set();
    for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
    return [...grams];
}

const splitSentences = (text) => text.match(/[^。！？；\n]+[。！？；]*[”’」』）)]*|[。！？；]+|\n+/g) || [text];

/**
 * @param {string} text 块正文
 * @param {string[]} grams 查询二元字组
 * @param {number} budget 截取字数上限
 */
export function focusText(text, grams, budget) {
    if (text.length <= budget) return text;
    const sentences = splitSentences(text);

    let best = -1;
    let bestScore = 0;
    sentences.forEach((s, i) => {
        const score = grams.reduce((n, g) => n + (s.includes(g) ? 1 : 0), 0);
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    });
    // 没有字面重合（纯语义命中）时取开头
    if (best < 0) return text.slice(0, budget);

    // 以关键句为中心，先补后一句、再补前一句，交替扩展到 budget
    let start = best;
    let end = best + 1;
    let len = sentences[best].length;
    for (let after = true; len < budget && (start > 0 || end < sentences.length); after = !after) {
        if (after && end < sentences.length) len += sentences[end++].length;
        else if (!after && start > 0) len += sentences[--start].length;
    }
    const window = sentences.slice(start, end).join('').trim();
    if (window.length <= budget) return window;
    // 关键句本身过长或最后一句超出：以关键句起点为中心截断
    const offset = sentences.slice(start, best).join('').length;
    const from = Math.max(0, Math.min(offset - Math.floor(budget / 4), window.length - budget));
    return window.slice(from, from + budget);
}
