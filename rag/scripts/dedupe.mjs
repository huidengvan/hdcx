/**
 * 重复内容标注（建索引时离线计算）。
 * 课程法本多选自慧灯之光，两边切块边界不同，查询时按候选两两比对效果差，因此在这里统一标注：
 *   - 低优先级的块（如慧灯之光）若 ≥ DUP_COVERAGE 的内容见于某个高优先级范围（如课程法本），记 dupOf / dupGroup；
 *   - 被重复的块记 alsoIn（JSON 字符串），供结果卡片显示「亦见于」。
 * 优先级即 rag/categories.json 中分类的顺序；分类设了 dedupeGroups 时，分类内各书之间也按 groups 顺序比对
 * （如参考资料中前行文库收录的前行备忘录，以前行备忘录为准）。
 *
 * 全部正文约两千多万字，8 字片段逐字建索引会超出 Map 的条目上限，因此片段取 32 位哈希，
 * 与块下标拼成 64 位整数排序后二分查找。
 */
import { createHash } from 'node:crypto';
import { categories } from './lib.mjs';

const SHINGLE = 8;
const QUERY_STRIDE = 4;
const DUP_COVERAGE = 0.6;
const MAX_ALSO_IN = 3;
// 出现在过多块中的片段（偈颂、套话）不参与投票
const MAX_POSTINGS = 64;

const hanzi = (text) => text.replace(/[^一-鿿]/g, '');

// FNV-1a 32 位哈希
function hash8(s, from) {
    let h = 0x811c9dc5;
    for (let i = from; i < from + SHINGLE; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// 每个块的比对范围（bucket）与优先级：分类顺序在前者优先；dedupeGroups 的分类内再按 group 顺序
function bucketsOf(chunks) {
    const order = [];
    for (const cat of categories) {
        if (cat.type === 'srt') continue;
        if (cat.dedupeGroups) cat.groups.forEach((g) => order.push(`${cat.id}|${g.id}`));
        else order.push(cat.id);
    }
    const rank = new Map(order.map((b, i) => [b, i]));
    const grouped = new Set(categories.filter((c) => c.dedupeGroups).map((c) => c.id));
    return chunks.map((c) => rank.get(grouped.has(c.cat) ? `${c.cat}|${c.group}` : c.cat));
}

/**
 * @param {{ doc: string, chunks: object[] }[]} docs 全部分类的切块结果（会就地写入 dupOf / dupGroup / alsoIn / metaHash）
 */
export function annotateDuplicates(docs) {
    const textCats = new Set(categories.filter((c) => c.type !== 'srt').map((c) => c.id));
    const chunks = docs.flatMap((d) => d.chunks).filter((c) => textCats.has(c.cat));
    for (const c of chunks) delete c.dupOf, delete c.dupGroup, delete c.alsoIn;
    const bucket = bucketsOf(chunks);
    const texts = chunks.map((c) => hanzi(c.text));

    // 逐字索引：(哈希 << 32 | 块下标) 排序
    let total = 0;
    for (const s of texts) total += Math.max(0, s.length - SHINGLE + 1);
    const postings = new BigUint64Array(total);
    let n = 0;
    texts.forEach((s, i) => {
        const idx = BigInt(i);
        for (let j = 0; j + SHINGLE <= s.length; j++) postings[n++] = (BigInt(hash8(s, j)) << 32n) | idx;
    });
    postings.sort();

    // 返回哈希为 h 的 postings 区间 [lo, hi)
    const range = (h) => {
        const key = BigInt(h) << 32n;
        let lo = 0;
        let hi = postings.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (postings[mid] < key) lo = mid + 1;
            else hi = mid;
        }
        const end = key | 0xffffffffn;
        let to = lo;
        while (to < postings.length && postings[to] <= end) to++;
        return [lo, to];
    };

    const reverse = new Map(); // 被重复块下标 -> 重复块
    texts.forEach((s, ci) => {
        const rank = bucket[ci];
        if (rank === 0) return;
        let queries = 0;
        const covered = new Map(); // bucket -> 覆盖片段数
        const votes = new Map(); // bucket -> Map(块下标 -> 票数)
        for (let j = 0; j + SHINGLE <= s.length; j += QUERY_STRIDE) {
            queries++;
            const [lo, hi] = range(hash8(s, j));
            if (hi - lo > MAX_POSTINGS) continue;
            const seen = new Set();
            let prev = -1;
            for (let p = lo; p < hi; p++) {
                const other = Number(postings[p] & 0xffffffffn);
                const b = bucket[other];
                // 同一块内重复出现的片段只计一票（区间内同哈希按块下标有序）
                if (b >= rank || other === prev) continue;
                prev = other;
                // 哈希碰撞：核对原文片段
                if (texts[other].indexOf(s.slice(j, j + SHINGLE)) < 0) continue;
                if (!seen.has(b)) {
                    seen.add(b);
                    covered.set(b, (covered.get(b) || 0) + 1);
                }
                if (!votes.has(b)) votes.set(b, new Map());
                const v = votes.get(b);
                v.set(other, (v.get(other) || 0) + 1);
            }
        }
        if (!queries) return;
        // 优先级最高且覆盖率达标的范围
        const target = [...covered].filter(([, k]) => k / queries >= DUP_COVERAGE).sort((a, b) => a[0] - b[0])[0];
        if (!target) return;
        // 票数相同取靠前的块（与相邻两块重合度相同时）
        const best = [...votes.get(target[0])].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        const c = chunks[ci];
        c.dupOf = chunks[best].id;
        c.dupGroup = chunks[best].group;
        if (!reverse.has(best)) reverse.set(best, []);
        reverse.get(best).push(c);
    });

    for (const [i, dups] of reverse) {
        chunks[i].alsoIn = JSON.stringify(
            dups.slice(0, MAX_ALSO_IN).map(({ group, article, title, url, pStart, pEnd }) => ({ group, article: article || title, url, pStart, pEnd })),
        );
    }

    // metaHash 只反映标注；无标注时为空，与旧 manifest 一致
    for (const d of docs) {
        const marks = d.chunks.filter((c) => c.dupOf || c.alsoIn).map((c) => [c.id, c.dupOf, c.alsoIn]);
        d.metaHash = marks.length ? createHash('sha1').update(JSON.stringify(marks)).digest('hex') : undefined;
    }

    return {
        dupChunks: chunks.filter((c) => c.dupOf).length,
        alsoInChunks: reverse.size,
    };
}
