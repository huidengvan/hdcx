/**
 * 字幕导入 D1：读取 rag/categories.json 中 type 为 srt 的分类（static/docs/srts/b1~b4），
 * 解析后生成 out/import.sql（建表 + 清空旧数据 + 写入），再用 wrangler 执行
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
import { ROOT, groups, parseArgs } from '../../../rag/scripts/lib.mjs';
import { parseSrt } from '../../../rag/scripts/srt-chunks.mjs';
import { normalize } from '../src/normalize.js';

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(WORKER_DIR, 'out', 'import.sql');
const DB_NAME = 'fayu';
// 单块字幕（原文 + 规范化文本）的字节上限：D1 单条 SQL 不超过 100KB；块越小，翻页时取回的无关字幕越少，但每次搜索读的行数越多
const BLOCK_BYTES = 40_000;

const toMs = (t) => {
    const [h, m, s] = t.split(':');
    return Math.round((+h * 3600 + +m * 60 + +s) * 1000);
};
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** 解析全部字幕 → videos / blocks 行 */
export function loadVideos() {
    const videos = [];
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
            videos.push({
                id: videos.length + 1,
                book: path.basename(g.dir),
                series: g.series,
                title: file.replace(/\.srt$/, ''),
                starts: cues.map((c) => toMs(c.start)),
                texts: cues.map((c) => c.text),
                duration: Math.round(toMs(cues.at(-1).end) / 1000),
            });
        }
    }
    return videos;
}

function toBlocks(v) {
    const blocks = [];
    let cur = null;
    v.texts.forEach((text, i) => {
        const norm = normalize(text);
        const bytes = Buffer.byteLength(text) + Buffer.byteLength(norm) + String(v.starts[i]).length + String(norm.length).length + 3;
        if (!cur || cur.bytes + bytes > BLOCK_BYTES) {
            cur = { seq: blocks.length, first: i, starts: [], texts: [], norms: [], bytes: 0 };
            blocks.push(cur);
        }
        cur.starts.push(v.starts[i]);
        cur.texts.push(text);
        cur.norms.push(norm);
        cur.bytes += bytes;
    });
    return blocks;
}

function buildSql(videos) {
    const blocks = videos.map(toBlocks);
    // 含规范化结果，规范化规则变化也会换版本
    const version = createHash('sha1')
        .update(JSON.stringify([videos, blocks]))
        .digest('hex')
        .slice(0, 12);
    const out = [fs.readFileSync(path.join(WORKER_DIR, 'schema.sql'), 'utf8'), 'DELETE FROM cue_blocks;', 'DELETE FROM videos;'];
    out.push(
        `INSERT INTO videos (id, book, series, title, cues, duration) VALUES\n${videos
            .map((v) => `(${v.id}, ${sqlStr(v.book)}, ${sqlStr(v.series)}, ${sqlStr(v.title)}, ${v.texts.length}, ${v.duration})`)
            .join(',\n')};`,
    );
    let blockCount = 0;
    videos.forEach((v, vi) => {
        for (const b of blocks[vi]) {
            const values = [b.starts.join(','), b.texts.join('\n'), b.norms.join(''), b.norms.map((n) => n.length).join(',')].map(sqlStr);
            out.push(`INSERT INTO cue_blocks (video_id, seq, first_cue, starts, texts, norm, norm_lens) VALUES (${v.id}, ${b.seq}, ${b.first}, ${values.join(', ')});`);
            blockCount++;
        }
    });
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
    const videos = loadVideos();
    const { sql, version, blockCount } = buildSql(videos);
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, sql);

    const cueCount = videos.reduce((n, v) => n + v.texts.length, 0);
    const byBook = Object.entries(Object.groupBy(videos, (v) => v.book))
        .map(([b, list]) => `${b} ${list.length}`)
        .join('，');
    console.log(`${videos.length} 个视频（${byBook}），${cueCount} 条字幕，${blockCount} 块，版本 ${version}`);
    console.log(`SQL：${path.relative(ROOT, OUT_FILE)}（${(Buffer.byteLength(sql) / 1048576).toFixed(2)} MB）`);
    if (args.dry) return;

    const target = args.local ? '--local' : '--remote';
    wrangler(['d1', 'execute', DB_NAME, target, `--file=${path.relative(WORKER_DIR, OUT_FILE)}`, '--yes']);
    wrangler([
        'd1',
        'execute',
        DB_NAME,
        target,
        '--command',
        `SELECT (SELECT COUNT(*) FROM videos) AS videos, (SELECT SUM(cues) FROM videos) AS cues, (SELECT COUNT(*) FROM cue_blocks) AS blocks, (SELECT value FROM meta WHERE name = 'version') AS version`,
    ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
