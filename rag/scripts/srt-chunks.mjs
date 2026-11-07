/**
 * 视频字幕（srt）切块。字幕为语音转写：每条约 11 字，词间用空格，几乎无标点。
 * 连续字幕累加到 MIN_CHARS~MAX_CHARS 字断块，达到 MIN_CHARS 后优先在停顿处断开；相邻块重叠 OVERLAP 条，避免一句话被切开。
 * 结果字段与正文块一致（id / cat / group / doc / title / article / section / text / embedText），另含：
 *   series（视频所在目录，如 慧灯禅修课第一册）、lineStart / lineEnd（srt 序号）、starts（各行开始时间，| 分隔）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, chunkId } from './lib.mjs';

const MIN_CHARS = 300;
const MAX_CHARS = 450;
const PAUSE_SEC = 3;
const OVERLAP = 4;
// 片尾的网站、微博、公众号、著作书单等，从第一个标记起到文件末尾都不是讲课内容
const CREDIT_MARKER = /慧灯之光网站|堪布新浪|新浪微博|腾讯微博|微信公众号|HDZ\s*GGW|https?\s*:\/\/|堪布著作|大陆出版|台湾出版|出版社|^\s*\d+\s*[.．、]\s*《/;

const toSec = (t) => {
    const [h, m, s] = t.replace(',', '.').split(':');
    return +h * 3600 + +m * 60 + +s;
};

export function parseSrt(raw) {
    const cues = raw
        .replace(/\r/g, '')
        .replace(/^﻿/, '')
        .trim()
        .split(/\n{2,}/)
        .map((block) => {
            const lines = block.split('\n');
            const ti = lines.findIndex((l) => l.includes('-->'));
            if (ti < 0) return null;
            const [start, end] = lines[ti].split('-->').map((s) => s.trim());
            const text = lines.slice(ti + 1).join(' ').replace(/\s+/g, ' ').trim();
            return text ? { n: Number(lines[0]) || null, start: start.replace(',', '.'), end: end.replace(',', '.'), text } : null;
        })
        .filter(Boolean);
    cues.forEach((c, i) => (c.n ??= i + 1));
    // 去掉片尾信息（只在最后 200 条中查找）
    const from = Math.max(0, cues.length - 200);
    const credit = cues.findIndex((c, i) => i >= from && CREDIT_MARKER.test(c.text));
    return credit >= 0 ? cues.slice(0, credit) : cues;
}

const charLen = (s) => s.replace(/\s/g, '').length;

function chunkCues(cues) {
    const chunks = [];
    let start = 0;
    while (start < cues.length) {
        let end = start;
        let len = 0;
        for (; end < cues.length; end++) {
            len += charLen(cues[end].text);
            if (len >= MAX_CHARS) break;
            const next = cues[end + 1];
            if (len >= MIN_CHARS && next && toSec(next.start) - toSec(cues[end].end) >= PAUSE_SEC) break;
        }
        end = Math.min(end, cues.length - 1);
        chunks.push(cues.slice(start, end + 1));
        if (end >= cues.length - 1) break;
        start = Math.max(start + 1, end + 1 - OVERLAP);
    }
    // 末尾过短的块并入前一块
    if (chunks.length > 1 && chunks.at(-1).reduce((n, c) => n + charLen(c.text), 0) < MIN_CHARS / 3) {
        const last = chunks.pop();
        const prev = chunks.at(-1);
        prev.push(...last.filter((c) => c.n > prev.at(-1).n));
    }
    return chunks;
}

/**
 * @param {{ id: string, label: string, cat: string, dir: string, series: string }} g
 * @param {(doc: string) => boolean} include
 */
export function buildSrtDocs(g, include) {
    const dir = path.join(ROOT, g.dir);
    const docs = [];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.srt')).sort()) {
        const title = file.replace(/\.srt$/, '');
        // 中文文件名过长，文档 id 用文件名哈希（Vectorize / Qdrant 的块 id 都要求较短）
        const doc = `${g.id}/${createHash('sha1').update(title).digest('hex').slice(0, 8)}`;
        if (!include(doc)) continue;
        const cues = parseSrt(fs.readFileSync(path.join(dir, file), 'utf8'));
        const chunks = chunkCues(cues).map((part, i) => {
            const text = part.map((c) => c.text).join('\n');
            return {
                id: chunkId(doc, i),
                cat: g.cat,
                group: g.id,
                doc,
                url: '/video',
                title,
                article: title,
                section: '',
                series: g.series,
                lineStart: part[0].n,
                lineEnd: part.at(-1).n,
                starts: part.map((c) => c.start).join('|'),
                text,
                embedText: `${g.label}视频《${title}》\n${part.map((c) => c.text).join(' ')}`,
            };
        });
        const hash = createHash('sha1')
            .update(JSON.stringify(chunks.map(({ embedText, starts, lineStart }) => [embedText, starts, lineStart])))
            .digest('hex');
        docs.push({ doc, group: g.id, title, hash, chunks, source: path.join(g.dir, file) });
    }
    return docs;
}
