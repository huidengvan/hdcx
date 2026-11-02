/**
 * 关键词搜索数据导入 D1，生成 out/import.sql（建表 + 清空旧数据 + 写入）后用 wrangler 执行
 *   课程视频：rag/categories.json 中 type 为 srt 的分类（static/docs/srts/b1~b4）
 *   文章：build/books/b1~b4（课程法本，与 AI 搜索相同）与 build/refs 下的静态页面（段落号与线上锚点一致，须先 pnpm build）；
 *        《慧灯之光》每册按二级标题拆成文章；跳过传承传记、喇荣课诵；与 AI 搜索相同，跳过目录与密法折叠内容
 *
 * 用法（仓库根目录）：
 *   pnpm fayu:import            导入远程 D1
 *   pnpm fayu:import --local    导入本地 D1（wrangler dev 用）
 *   pnpm fayu:import --dry      只生成 SQL，不导入
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { ROOT, groups, parseArgs } from '../../../rag/scripts/lib.mjs';
import { parseSrt } from '../../../rag/scripts/srt-chunks.mjs';
import { clean, extractUnits, listDocFiles } from '../../../rag/scripts/build-chunks.mjs';
import { normalize } from '../src/normalize.js';

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(WORKER_DIR, 'out', 'import.sql');
const DB_NAME = 'fayu';
// 单块原文、规范化文本各自的字节上限（两者分表存放，每条 SQL 不超过 100KB）；块越大，每次搜索扫描的行数越少
const BLOCK_BYTES = 90_000;
// 不参与关键词搜索的页面：传承传记、喇荣课诵、标签索引页
const SKIP = ['refs/cczj', 'refs/lrksj', 'refs/tags'];
// 超长段落（个别源文件漏了空行，一段长达数万字）按句拆成约 PIECE_CHARS 字的几份，沿用同一段落号
const MAX_UNIT_CHARS = 2000;
const PIECE_CHARS = 1500;

const toMs = (t) => {
    const [h, m, s] = t.split(':');
    return Math.round((+h * 3600 + +m * 60 + +s) * 1000);
};
const sqlStr = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const under = (doc, dir) => doc === dir || doc.startsWith(`${dir}/`);

/** 课程视频：每条字幕为一个单位，marks 为开始时间（毫秒） */
export function loadVideos() {
    const docs = [];
    for (const g of groups.filter((x) => x.type === 'srt')) {
        const dir = path.join(ROOT, g.dir);
        const files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.srt'))
            .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));
        for (const file of files) {
            const cues = parseSrt(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (!cues.length) {
                console.warn(`跳过空字幕：${g.dir}/${file}`);
                continue;
            }
            docs.push({
                cat: 'video',
                grp: path.basename(g.dir),
                grpLabel: g.label,
                title: file.replace(/\.srt$/, ''),
                series: g.series,
                marks: cues.map((c) => toMs(c.start)),
                texts: cues.map((c) => c.text),
            });
        }
    }
    return docs;
}

// refs 一级目录的名称：_category_.json 的 label（部分文件含单引号，不是严格 JSON，用正则读取），没有则取 index.md 的标题
function dirLabel(dir) {
    const category = path.join(ROOT, dir, '_category_.json');
    const label = fs.existsSync(category) && fs.readFileSync(category, 'utf8').match(/"label"\s*:\s*"([^"]+)"/);
    if (label) return label[1];
    const index = path.join(ROOT, dir, 'index.md');
    const m = fs.existsSync(index) && fs.readFileSync(index, 'utf8').match(/^title:\s*["']?(.+?)["']?\s*$/m);
    return m ? m[1] : path.basename(dir);
}

function splitLong(text) {
    if (text.length <= MAX_UNIT_CHARS) return [text];
    const pieces = [];
    let cur = '';
    for (const s of text.match(/[^。！？；]+[。！？；]*[”’」』）)]*|[。！？；]+/g) || [text]) {
        // 无标点的长句按 PIECE_CHARS 硬切
        for (let i = 0; i < s.length; i += PIECE_CHARS) {
            const part = s.slice(i, i + PIECE_CHARS);
            if (cur && cur.length + part.length > PIECE_CHARS) {
                pieces.push(cur);
                cur = '';
            }
            cur += part;
        }
    }
    if (cur) pieces.push(cur);
    return pieces;
}

/** 文章：每个带锚点的段落为一个单位，marks 为段落号；conts 标记拆开的长段（与下一单位同属一段） */
export function loadArticles() {
    const hdzg = new Map(groups.filter((g) => g.cat === 'hdzg').map((g) => [g.id, g]));
    const books = groups.filter((g) => g.cat === 'books');
    const docs = [];
    for (const file of [...books.flatMap((g) => listDocFiles(g.id)), ...listDocFiles('refs')]) {
        const doc = path.relative(path.join(ROOT, 'build'), path.dirname(file)).split(path.sep).join('/');
        if (SKIP.some((s) => under(doc, s))) continue;
        const book = books.find((g) => under(doc, g.id));
        const isHdzg = under(doc, 'refs/hdzg');
        if (isHdzg && !hdzg.has(doc)) continue;

        const root = parse(fs.readFileSync(file, 'utf8'));
        const md = root.querySelector('article .theme-doc-markdown');
        if (!md) continue;
        const units = extractUnits(md).filter((u) => !u.heading && u.p != null && u.text);
        if (!units.length) continue;
        const title = clean(md.querySelector('header h1')?.text || root.querySelector('title')?.text || doc);

        const top = doc.split('/').slice(0, 2).join('/');
        const base = book
            ? { cat: 'books', grp: book.id, grpLabel: book.label }
            : isHdzg
            ? { cat: 'hdzg', grp: doc, grpLabel: hdzg.get(doc).label }
            : top === 'refs/misc'
              ? { cat: 'misc', grp: top, grpLabel: '其他参考' }
              : { cat: 'refs', grp: top, grpLabel: dirLabel(top) };

        // 《慧灯之光》整册一个页面，按二级标题拆成文章；其余页面即一篇文章
        const parts = [];
        for (const u of units) {
            const name = (isHdzg && u.path.find(([level]) => level === 2)?.[1]) || title;
            if (parts.at(-1)?.title !== name) parts.push({ title: name, units: [] });
            parts.at(-1).units.push(u);
        }
        for (const part of parts) {
            const d = { ...base, title: part.title, url: `/${doc}`, marks: [], texts: [], conts: [] };
            for (const u of part.units) {
                const pieces = splitLong(u.text.replace(/\n/g, ' '));
                pieces.forEach((piece, k) => {
                    d.marks.push(u.p);
                    d.texts.push(piece);
                    d.conts.push(k < pieces.length - 1);
                });
            }
            docs.push(d);
        }
    }
    return docs;
}

// 文章段落之间加换行（查询规范化后不含换行），使短语不跨段匹配；视频字幕与拆开的长段直接相连，允许跨条匹配
function toBlocks(d) {
    const blocks = [];
    let cur = null;
    d.texts.forEach((text, i) => {
        const norm = normalize(text) + (d.cat === 'video' || d.conts[i] ? '' : '\n');
        const textBytes = Buffer.byteLength(text) + String(d.marks[i]).length + 2;
        const normBytes = Buffer.byteLength(norm) + String(norm.length).length + 1;
        if (!cur || cur.textBytes + textBytes > BLOCK_BYTES || cur.normBytes + normBytes > BLOCK_BYTES) {
            cur = { seq: blocks.length, first: i, marks: [], texts: [], norms: [], textBytes: 0, normBytes: 0 };
            blocks.push(cur);
        }
        cur.marks.push(d.marks[i]);
        cur.texts.push(text);
        cur.norms.push(norm);
        cur.textBytes += textBytes;
        cur.normBytes += normBytes;
    });
    return blocks;
}

function buildSql(docs) {
    const hash = createHash('sha1');
    const out = [fs.readFileSync(path.join(WORKER_DIR, 'schema.sql'), 'utf8'), 'DELETE FROM block_norms;', 'DELETE FROM block_texts;', 'DELETE FROM docs;'];

    for (let i = 0; i < docs.length; i += 200) {
        const rows = docs.slice(i, i + 200).map((d, k) =>
            [i + k + 1, sqlStr(d.cat), sqlStr(d.grp), sqlStr(d.grpLabel), sqlStr(d.title), sqlStr(d.series), sqlStr(d.url), d.texts.length].join(', '),
        );
        const sql = `INSERT INTO docs (id, cat, grp, grp_label, title, series, url, units) VALUES\n(${rows.join('),\n(')});`;
        hash.update(sql);
        out.push(sql);
    }

    let blockCount = 0;
    docs.forEach((d, i) => {
        for (const b of toBlocks(d)) {
            const key = `${i + 1}, ${b.seq}`;
            const norms = `INSERT INTO block_norms (doc_id, seq, cat, norm, norm_lens) VALUES (${key}, ${sqlStr(d.cat)}, ${sqlStr(b.norms.join(''))}, ${sqlStr(b.norms.map((n) => n.length).join(','))});`;
            const texts = `INSERT INTO block_texts (doc_id, seq, first_unit, marks, texts) VALUES (${key}, ${b.first}, ${sqlStr(b.marks.join(','))}, ${sqlStr(b.texts.join('\n'))});`;
            hash.update(norms).update(texts);
            out.push(norms, texts);
            blockCount++;
        }
    });

    // 内容哈希含规范化结果，规范化规则变化也会换版本
    const version = hash.digest('hex').slice(0, 12);
    out.push(
        `INSERT OR REPLACE INTO meta (name, value) VALUES ('version', ${sqlStr(version)}), ('updated_at', ${sqlStr(new Date().toISOString())});`,
    );
    return { sql: out.join('\n') + '\n', version, blockCount };
}

function wrangler(args) {
    const isWin = process.platform === 'win32';
    // Windows 下经 shell 执行，含空格的参数需加引号
    const argv = isWin ? args.map((a) => (/[\s()]/.test(a) ? `"${a}"` : a)) : args;
    const res = spawnSync(isWin ? 'npx.cmd' : 'npx', ['wrangler', ...argv], { cwd: WORKER_DIR, stdio: 'inherit', shell: isWin });
    if (res.status !== 0) throw new Error(`wrangler ${args.join(' ')} 失败（退出码 ${res.status}）`);
}

function main() {
    const args = parseArgs();
    if (!['books', 'refs'].every((d) => fs.existsSync(path.join(ROOT, 'build', d)))) throw new Error('找不到 build/books 或 build/refs，请先执行 pnpm build');
    const docs = [...loadVideos(), ...loadArticles()];
    const { sql, version, blockCount } = buildSql(docs);
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, sql);

    for (const [cat, list] of Object.entries(Object.groupBy(docs, (d) => d.cat))) {
        const units = list.reduce((n, d) => n + d.texts.length, 0);
        const chars = list.reduce((n, d) => n + d.texts.reduce((m, t) => m + t.length, 0), 0);
        console.log(`${cat.padEnd(6)} ${String(list.length).padStart(4)} 篇，${String(units).padStart(6)} 条/段，${(chars / 1e4).toFixed(0)} 万字`);
    }
    console.log(`共 ${docs.length} 篇，${blockCount} 块，版本 ${version}`);
    console.log(`SQL：${path.relative(ROOT, OUT_FILE)}（${(Buffer.byteLength(sql) / 1048576).toFixed(1)} MB）`);
    if (args.dry) return;

    const target = args.local ? '--local' : '--remote';
    wrangler(['d1', 'execute', DB_NAME, target, `--file=${path.relative(WORKER_DIR, OUT_FILE)}`, '--yes']);
    wrangler([
        'd1',
        'execute',
        DB_NAME,
        target,
        '--command',
        `SELECT cat, COUNT(*) AS docs, SUM(units) AS units, (SELECT COUNT(*) FROM block_norms b WHERE b.cat = d.cat) AS blocks FROM docs d GROUP BY cat`,
    ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
