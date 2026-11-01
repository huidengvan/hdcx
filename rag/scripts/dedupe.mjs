/**
 * 跨分类重复内容标注（建索引时离线计算）。
 * 课程法本多选自慧灯之光，两边切块边界不同，查询时按候选两两比对效果差，因此在这里统一标注：
 *   - 低优先级分类的块（如慧灯之光）若 ≥ DUP_COVERAGE 的内容见于高优先级分类（如课程法本），记 dupOf / dupGroup；
 *   - 被重复的块记 alsoIn（JSON 字符串），供结果卡片显示「亦见于」。
 * 分类优先级即 rag/categories.json 中的顺序。
 */
import { createHash } from 'node:crypto';
import { categories } from './lib.mjs';

const SHINGLE = 8;
const DUP_COVERAGE = 0.6;
const MAX_ALSO_IN = 3;

const catRank = new Map(categories.map((c, i) => [c.id, i]));
const hanzi = (text) => text.replace(/[^一-鿿]/g, '');

/**
 * @param {{ doc: string, chunks: object[] }[]} docs 全部分类的切块结果（会就地写入 dupOf / dupGroup / alsoIn / metaHash）
 */
export function annotateDuplicates(docs) {
    const chunks = docs.flatMap((d) => d.chunks);
    for (const c of chunks) delete c.dupOf, delete c.dupGroup, delete c.alsoIn;

    // 各分类的 8 字片段索引（步长 1），用于被比对
    const index = new Map(); // cat -> Map(shingle -> Set(chunkIndex))
    chunks.forEach((c, i) => {
        if (!index.has(c.cat)) index.set(c.cat, new Map());
        const map = index.get(c.cat);
        const s = hanzi(c.text);
        for (let j = 0; j + SHINGLE <= s.length; j++) {
            const key = s.slice(j, j + SHINGLE);
            if (!map.has(key)) map.set(key, new Set());
            map.get(key).add(i);
        }
    });

    const reverse = new Map(); // 被重复块下标 -> 重复块
    chunks.forEach((c) => {
        const rank = catRank.get(c.cat);
        const s = hanzi(c.text);
        const keys = [];
        for (let j = 0; j + SHINGLE <= s.length; j += 4) keys.push(s.slice(j, j + SHINGLE));
        if (!keys.length) return;

        for (const [cat, map] of index) {
            if (catRank.get(cat) >= rank) continue;
            let covered = 0;
            const votes = new Map();
            for (const k of keys) {
                const hits = map.get(k);
                if (!hits) continue;
                covered++;
                for (const i of hits) votes.set(i, (votes.get(i) || 0) + 1);
            }
            if (covered / keys.length < DUP_COVERAGE) continue;
            const best = [...votes].sort((a, b) => b[1] - a[1])[0][0];
            c.dupOf = chunks[best].id;
            c.dupGroup = chunks[best].group;
            if (!reverse.has(best)) reverse.set(best, []);
            reverse.get(best).push(c);
            break;
        }
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
