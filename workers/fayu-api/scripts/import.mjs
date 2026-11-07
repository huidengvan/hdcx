/**
 * 关键词搜索数据增量导入 D1：对比本地内容与 manifest.json，只把变化的文档写入 out/import.sql，再用 wrangler 执行
 *   课程视频：rag/categories.json 中 type 为 srt 的分类（static/docs/srts/b1~b4）
 *   文章：build/books/b1~b4（课程法本，与 AI 搜索相同）与 build/refs 下的静态页面（段落号与线上锚点一致，须先 pnpm build）；
 *        《慧灯之光》每册按二级标题拆成文章；跳过传承传记、喇荣课诵；与 AI 搜索相同，跳过目录与密法折叠内容
 *
 * 用法（仓库根目录）：
 *   pnpm fayu:import            增量导入远程 D1，成功后更新 manifest.json，须随 git 提交（没有清单或与库中版本不一致时自动改走全量）
 *   pnpm fayu:import --local    增量导入本地 D1（wrangler dev 用），清单为不提交的 out/manifest.local.json
 *   pnpm fayu:import --full     全量：删表重建并按顺序重新编号
 *   pnpm fayu:import --dry      只生成 SQL，不导入，也不改清单（增量时仍会读库中版本；加 --full 则不访问数据库）
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
// 各文档的编号与内容哈希，记录远程库的现状，像 lock 文件一样随 git 提交；本地库另存一份，不提交
const MANIFEST = path.join(WORKER_DIR, 'manifest.json');
const LOCAL_MANIFEST = path.join(WORKER_DIR, 'out', 'manifest.local.json');
const DB_NAME = 'fayu';
// 单块原文、规范化文本各自的字节上限（两者分表存放，每条 SQL 不超过 100KB）；块越大，每次搜索扫描的行数越少
const BLOCK_BYTES = 90_000;
// doc_norms 单行的字节上限（D1 单行上限 2MB），超出的文档拆成多份
const PART_BYTES = 1_800_000;
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
// 文档的稳定标识：《慧灯之光》一个页面拆成多篇，须带标题
const docKey = (d) => (d.url ? `${d.url}#${d.title}` : `${d.grp}/${d.title}`);

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

/** 切块并计算内容哈希。哈希含规范化结果与分块，规范化规则或块大小变化时文档自动算作改动 */
function prepare(d) {
    const blocks = toBlocks(d);
    const content = [d.cat, d.grp, d.grpLabel, d.title, d.series, d.url, d.texts.length, blocks.map((b) => [b.first, b.marks, b.texts, b.norms])];
    return { ...d, key: docKey(d), blocks, hash: createHash('sha1').update(JSON.stringify(content)).digest('hex') };
}

/** 读取清单，并用库中版本核对它确实描述当前的库。没有清单、上次全量未完成、新库或版本不一致时返回 null，改走全量 */
function readState(target, file) {
    const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (!manifest?.version) return null;
    const sql = `SELECT value FROM meta WHERE name = 'version'`;
    const { status, stdout, stderr } = wrangler(['d1', 'execute', DB_NAME, target, '--json', '--command', sql], true);
    if (status === 0) return JSON.parse(stdout)[0].results[0]?.value === manifest.version ? manifest : null;
    if (/no such table/.test(stdout + stderr)) return null;
    throw new Error(`读取 D1 失败（退出码 ${status}）：${stdout}${stderr}`);
}

/** 对比本地与清单，给每篇文档定编号，得出要写入的文档与要删除的标识。已有文档沿用原 id，块的外键和排序都不受影响 */
function diff(docs, state) {
    const old = state?.docs ?? {};
    let nextId = Math.max(0, ...Object.values(old).map((r) => r.id));
    const changed = [];
    for (const d of docs) {
        const row = old[d.key];
        d.id = row?.id ?? ++nextId;
        if (row?.hash !== d.hash) changed.push(d);
    }
    const keys = new Set(docs.map((d) => d.key));
    return { changed, removed: Object.keys(old).filter((k) => !keys.has(k)) };
}

/** 导入前的清单：涉及的文档 hash 置空，version 不变。D1 文档没有承诺文件导入失败时回滚，这样中途失败后重跑必定重写它们，内容改回去也一样 */
function pendingManifest(state, { changed, removed }) {
    const docs = { ...state?.docs };
    for (const d of changed) docs[d.key] = { id: d.id, hash: null };
    for (const key of removed) docs[key] = { ...docs[key], hash: null };
    return { version: state?.version ?? null, docs };
}

function writeManifest(file, manifest) {
    const docs = Object.entries(manifest.docs).sort(([, a], [, b]) => a.id - b.id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...manifest, docs: Object.fromEntries(docs) }, null, 2) + '\n');
}

// 每篇先删后写，重跑结果相同；version 最后写，结果缓存在全部写完后才失效
function docSql(d) {
    const { id } = d;
    const out = [
        `DELETE FROM doc_norms WHERE doc_id = ${id};`,
        `DELETE FROM block_norms WHERE doc_id = ${id};`,
        `DELETE FROM block_texts WHERE doc_id = ${id};`,
        `INSERT OR REPLACE INTO docs (id, cat, grp, grp_label, title, series, url, units) VALUES (${[id, sqlStr(d.cat), sqlStr(d.grp), sqlStr(d.grpLabel), sqlStr(d.title), sqlStr(d.series), sqlStr(d.url), d.texts.length].join(', ')});`,
    ];
    for (const b of d.blocks) {
        const key = `${id}, ${b.seq}`;
        out.push(
            `INSERT INTO block_norms (doc_id, seq, cat, norm, norm_lens) VALUES (${key}, ${sqlStr(d.cat)}, ${sqlStr(b.norms.join(''))}, ${sqlStr(b.norms.map((n) => n.length).join(','))});`,
            `INSERT INTO block_texts (doc_id, seq, first_unit, marks, texts) VALUES (${key}, ${b.first}, ${sqlStr(b.marks.join(','))}, ${sqlStr(b.texts.join('\n'))});`,
        );
    }
    // 排名用的整篇文本在库内由块拼接，不必重复上传。须用 VALUES + 子查询：INSERT ... SELECT 在事务中要写临时文件（语句日志），
    // 本地 TMP 无效时报 SQLITE_CANTOPEN，线上环境是否支持也无从确认
    partRanges(d.blocks).forEach(([first, last], part) => {
        out.push(
            `INSERT INTO doc_norms (doc_id, part, cat, norm) VALUES (${id}, ${part}, ${sqlStr(d.cat)}, (SELECT group_concat(norm, char(10)) FROM block_norms WHERE doc_id = ${id} AND seq BETWEEN ${first} AND ${last}));`,
        );
    });
    return out;
}

/** 把一篇文档的块分成不超过 PART_BYTES 的几份，返回各份的 [首块, 末块] */
function partRanges(blocks) {
    const ranges = [];
    let bytes = 0;
    for (const b of blocks) {
        if (!ranges.length || bytes + b.normBytes > PART_BYTES) {
            ranges.push([b.seq, b.seq]);
            bytes = 0;
        }
        ranges.at(-1)[1] = b.seq;
        bytes += b.normBytes;
    }
    return ranges;
}

function buildSql({ changed, removed }, state, version) {
    const full = !state;
    const out = [];
    if (full) {
        // 直接 DROP 有数据的大表，在事务中同样要写临时文件；先建齐缺的表、清空，再 DROP 空表并按新结构重建
        const schema = fs.readFileSync(path.join(WORKER_DIR, 'schema.sql'), 'utf8');
        const tables = ['doc_norms', 'block_norms', 'block_texts', 'docs'];
        out.push(schema, ...tables.map((t) => `DELETE FROM ${t};`), ...tables.map((t) => `DROP TABLE ${t};`), schema);
    }
    if (removed.length) {
        const ids = removed.map((k) => state.docs[k].id).join(', ');
        for (const table of ['doc_norms', 'block_norms', 'block_texts']) out.push(`DELETE FROM ${table} WHERE doc_id IN (${ids});`);
        out.push(`DELETE FROM docs WHERE id IN (${ids});`);
    }
    for (const d of changed) out.push(...docSql(d));
    out.push(`INSERT OR REPLACE INTO meta (name, value) VALUES ('version', ${sqlStr(version)}), ('updated_at', ${sqlStr(new Date().toISOString())});`);
    // 缓存键含版本，旧行本来就不会命中，这里只是回收空间
    out.push('DELETE FROM rank_cache;');
    return out.join('\n') + '\n';
}

function wrangler(args, capture = false) {
    const isWin = process.platform === 'win32';
    // Windows 下经 shell 执行，含空格的参数需加引号
    const argv = isWin ? args.map((a) => (/[\s()]/.test(a) ? `"${a}"` : a)) : args;
    const res = spawnSync(isWin ? 'npx.cmd' : 'npx', ['wrangler', ...argv], { cwd: WORKER_DIR, stdio: capture ? 'pipe' : 'inherit', shell: isWin, encoding: 'utf8' });
    if (capture) return res;
    if (res.status !== 0) throw new Error(`wrangler ${args.join(' ')} 失败（退出码 ${res.status}）`);
}

function main() {
    const args = parseArgs();
    if (!['books', 'refs'].every((d) => fs.existsSync(path.join(ROOT, 'build', d)))) throw new Error('找不到 build/books 或 build/refs，请先执行 pnpm build');
    const docs = [...loadVideos(), ...loadArticles()].map(prepare);
    const dup = Object.entries(Object.groupBy(docs, (d) => d.key)).find(([, list]) => list.length > 1);
    if (dup) throw new Error(`文档标识重复，无法增量对比：${dup[0]}`);

    for (const [cat, list] of Object.entries(Object.groupBy(docs, (d) => d.cat))) {
        const units = list.reduce((n, d) => n + d.texts.length, 0);
        const chars = list.reduce((n, d) => n + d.texts.reduce((m, t) => m + t.length, 0), 0);
        console.log(`${cat.padEnd(6)} ${String(list.length).padStart(4)} 篇，${String(units).padStart(6)} 条/段，${(chars / 1e4).toFixed(0)} 万字`);
    }
    const version = createHash('sha1').update(docs.map((d) => `${d.key}:${d.hash}`).sort().join('\n')).digest('hex').slice(0, 12);
    console.log(`共 ${docs.length} 篇，${docs.reduce((n, d) => n + d.blocks.length, 0)} 块，版本 ${version}`);

    const target = args.local ? '--local' : '--remote';
    const manifest = args.local ? LOCAL_MANIFEST : MANIFEST;
    const state = args.full ? null : readState(target, manifest);
    if (!state && !args.full) console.log('没有可用的清单（首次导入、上次全量未完成或与库中版本不一致），改走全量导入');
    const plan = diff(docs, state);
    if (state && !plan.changed.length && !plan.removed.length && state.version === version) {
        console.log('内容没有变化，无需导入');
        return;
    }
    console.log(`${state ? '增量' : '全量'}：写入 ${plan.changed.length} 篇，删除 ${plan.removed.length} 篇`);

    const sql = buildSql(plan, state, version);
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, sql);
    console.log(`SQL：${path.relative(ROOT, OUT_FILE)}（${(Buffer.byteLength(sql) / 1048576).toFixed(1)} MB）`);
    if (args.dry) return;

    writeManifest(manifest, pendingManifest(state, plan));
    wrangler(['d1', 'execute', DB_NAME, target, `--file=${path.relative(WORKER_DIR, OUT_FILE)}`, '--yes']);
    writeManifest(manifest, { version, docs: Object.fromEntries(docs.map((d) => [d.key, { id: d.id, hash: d.hash }])) });
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
