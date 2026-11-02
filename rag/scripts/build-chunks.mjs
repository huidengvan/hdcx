/**
 * 从 build/ 下的静态 HTML 抽取正文并切块。
 * 段落锚点 id="pN" 由 src/plugins/para-anchor.js 在构建时生成，直接读取 HTML 可保证与线上锚点一致。
 *
 * 用法：node rag/scripts/build-chunks.mjs [--only books/b4]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse } from 'node-html-parser';
import { ROOT, OUT_DIR, DIMENSIONS, groups, parseArgs, matchOnly } from './lib.mjs';
import { buildSrtDocs } from './srt-chunks.mjs';

const MIN_CHARS = 600; // 达到即可断块
const MAX_CHARS = 800; // 加入下一段会超过则断块
const TINY_CHARS = 150; // 过短的块并入下一块
const SPLIT_CHARS = 700; // 超长单段按句拆分后每份的目标字数
const FORCE_BREAK_LEVEL = 3; // h2/h3 强制断块
const SECRET_KEYWORDS = ['密法', '灌顶', '密宗', '请勿阅读', '警告'];
// 切块规则或向量输入格式变化时递增，使 manifest 中所有文章重建
export const CHUNK_VERSION = 1;

// 去掉控制字符与零宽字符；源文件软换行在中文之间产生的空白直接去掉，其余空白折叠为一个空格
export const clean = (s) =>
    s
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f​﻿]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/(?<=[　-鿿＀-￯])\s(?=[　-鿿＀-￯])/g, '')
        .trim();

const stripTibetan = (s) =>
    s
        .replace(/[ༀ-࿿]+/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();

const isAdmonition =(el) => /theme-admonition|alert/.test(el.getAttribute?.('class') || '');

// 与 src/utils/index.js 的 getSecretDharmaWarning 同规则：details 前 6 个兄弟元素内有密法类提示框
function isSecretDetails(details) {
    let el = details.previousElementSibling;
    for (let i = 0; el && i < 6; i++, el = el.previousElementSibling) {
        const alert = isAdmonition(el) ? el : el.querySelector('.theme-admonition, .alert, [class*="theme-admonition"]');
        if (alert && SECRET_KEYWORDS.some((k) => alert.text.includes(k))) return true;
        if (el.tagName === 'DETAILS') break;
    }
    return false;
}

function isTocDetails(details) {
    const summary = details.querySelector('summary');
    return summary && clean(summary.text) === '目录';
}

// 按文档顺序遍历正文，产出以 <p id="pN"> 为锚点的段落单元
export function extractUnits(markdownEl) {
    const units = [];
    const sections = []; // [level, text]
    let current = null;

    const sectionPath = () => sections.map(([level, t]) => [level, t]);
    const append = (text) => {
        text = clean(text);
        if (!text) return;
        if (current) current.text += (current.text ? '\n' : '') + text;
        else {
            // 文首出现无锚点文本时挂到第一个段落上（遇到 pN 时再回填）
            current = { p: null, text, path: sectionPath() };
            units.push(current);
        }
    };

    const walk = (node) => {
        for (const child of node.childNodes) {
            if (child.nodeType !== 1) continue;
            const tag = child.tagName;
            if (['SCRIPT', 'STYLE', 'BUTTON', 'NAV', 'HEADER', 'SVG', 'SUP'].includes(tag)) continue;
            if (tag === 'DETAILS' && (isTocDetails(child) || isSecretDetails(child))) continue;

            const h = tag.match(/^H([2-6])$/);
            if (h) {
                const level = Number(h[1]);
                while (sections.length && sections.at(-1)[0] >= level) sections.pop();
                sections.push([level, clean(child.text)]);
                current = null;
                units.push({ heading: level });
                continue;
            }

            if (tag === 'P') {
                const id = child.getAttribute('id');
                const m = id?.match(/^p(\d+)$/);
                if (m) {
                    child.querySelector(`a[href="#${id}"]`)?.remove();
                    const p = Number(m[1]);
                    if (current && current.p === null) {
                        current.p = p;
                        current.text += `\n${clean(child.text)}`;
                    } else {
                        current = { p, text: clean(child.text), path: sectionPath() };
                        units.push(current);
                    }
                } else append(child.text);
                continue;
            }

            if (tag === 'LI' || tag === 'TD' || tag === 'TH') {
                // 只取本层文字，嵌套列表/段落继续递归，避免重复
                const nested = child.childNodes.filter((n) => n.nodeType === 1 && ['UL', 'OL', 'P', 'DIV', 'BLOCKQUOTE'].includes(n.tagName));
                const own = child.childNodes.filter((n) => !nested.includes(n)).map((n) => n.text).join('');
                append(own);
                for (const n of nested) walk({ childNodes: [n] });
                continue;
            }

            walk(child);
        }
    };

    walk(markdownEl);
    return units;
}

// 单段超过 MAX_CHARS 时按句拆成约 SPLIT_CHARS 字的子单元，子单元沿用同一段落号
function splitLongUnits(units) {
    return units.flatMap((u) => {
        if (u.heading || !u.text || u.text.length <= MAX_CHARS) return [u];
        const sentences = u.text.match(/[^。！？；\n]+[。！？；]*[”’」』）)]*|[。！？；]+|\n+/g) || [u.text];
        const pieces = [];
        let buf = '';
        for (let sentence of sentences) {
            // 单句本身过长（如无标点的偈颂）时硬切
            while (sentence.length > SPLIT_CHARS) {
                if (buf) pieces.push(buf);
                pieces.push(sentence.slice(0, SPLIT_CHARS));
                sentence = sentence.slice(SPLIT_CHARS);
                buf = '';
            }
            if (buf && buf.length + sentence.length > SPLIT_CHARS) {
                pieces.push(buf);
                buf = '';
            }
            buf += sentence;
        }
        if (buf.trim()) pieces.push(buf);
        return pieces.map((text) => ({ ...u, text: text.trim() }));
    });
}

// 600~800 字弹性窗口合并段落，不在段落中间切；h2/h3 强制断块，文章标题层级（articleHeading）无条件断块
function chunkUnits(units, articleHeading) {
    const chunks = [];
    let buf = null;
    const flush = () => {
        if (buf?.parts.length) chunks.push(buf);
        buf = null;
    };
    // 文章末尾过短的块并入同一文章的前一块
    const articleOf = (c) => c.path.find(([l]) => l === articleHeading)?.[1];
    const flushArticleEnd = () => {
        const prev = chunks.at(-1);
        if (buf && buf.len < TINY_CHARS && prev && articleOf(prev) === articleOf(buf)) {
            prev.parts.push(...buf.parts);
            prev.pEnd = buf.pEnd;
            prev.len += buf.len;
            buf = null;
        } else flush();
    };

    for (const u of units) {
        if (u.heading) {
            if (articleHeading && u.heading <= articleHeading) flushArticleEnd();
            else if (u.heading <= FORCE_BREAK_LEVEL && buf && buf.len >= TINY_CHARS) flush();
            continue;
        }
        if (u.p === null || !u.text) continue;
        if (buf && (buf.len >= MIN_CHARS || (buf.len + u.text.length > MAX_CHARS && buf.len >= TINY_CHARS))) flush();
        if (!buf) buf = { path: u.path, pStart: u.p, pEnd: u.p, parts: [], len: 0 };
        buf.parts.push(u.text);
        buf.pEnd = u.p;
        buf.len += u.text.length;
    }
    if (articleHeading) flushArticleEnd();
    else flush();

    // 末尾过短的块并入前一块（按文章分篇时已在上面处理）
    if (!articleHeading && chunks.length > 1 && chunks.at(-1).len < TINY_CHARS) {
        const last = chunks.pop();
        const prev = chunks.at(-1);
        prev.parts.push(...last.parts);
        prev.pEnd = last.pEnd;
        prev.len += last.len;
    }
    return chunks;
}

// Docusaurus 构建元数据（.docusaurus/docusaurus-plugin-content-docs/*/site-*.json）：源文件 → 页面路径
let docMeta;
function loadDocMeta() {
    if (docMeta) return docMeta;
    const base = path.join(ROOT, '.docusaurus', 'docusaurus-plugin-content-docs');
    if (!fs.existsSync(base)) throw new Error('找不到 .docusaurus 构建元数据，请先执行 pnpm build');
    docMeta = [];
    for (const plugin of fs.readdirSync(base)) {
        const dir = path.join(base, plugin);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const f of fs.readdirSync(dir).filter((f) => f.startsWith('site-') && f.endsWith('.json'))) {
            const { source, permalink } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (source && permalink) docMeta.push({ source: source.replace(/^@site\//, ''), doc: permalink.replace(/^\/|\/$/g, '') });
        }
    }
    return docMeta;
}

// 按源目录收录的 group：返回 [{ file, doc, source }]，doc 为页面路径（即线上网址）
function listSrcDocs(src) {
    return loadDocMeta()
        .filter((m) => m.source.startsWith(`${src}/`))
        .map((m) => ({ ...m, file: path.join(ROOT, 'build', m.doc, 'index.html') }))
        .filter((m) => fs.existsSync(m.file))
        .sort((a, b) => a.source.localeCompare(b.source));
}

export function listDocFiles(groupId) {
    const dir = path.join(ROOT, 'build', groupId);
    if (!fs.existsSync(dir)) throw new Error(`找不到 ${dir}，请先执行 pnpm build`);
    const files = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name === 'index.html' && d !== dir) files.push(full);
        }
    };
    walk(dir);
    // 整册为单篇文章（如 refs/hdzg/01）时，group 目录本身就是文章
    if (!files.length && fs.existsSync(path.join(dir, 'index.html'))) files.push(path.join(dir, 'index.html'));
    return files.sort();
}

export function buildChunks({ only, groupList = groups } = {}) {
    const docs = [];
    for (const g of groupList) {
        if (!matchOnly(only, g.id) && !String(only || '').split(',').some((o) => o.startsWith(`${g.id}/`))) continue;
        // 视频字幕直接读 srt，不依赖构建产物
        if (g.type === 'srt') {
            docs.push(...buildSrtDocs(g, (doc) => matchOnly(only, doc)));
            continue;
        }
        // 按源目录收录的 group 页面路径不在 group id 下，--only 指定 group 时整组收录
        const wholeGroup = matchOnly(only, g.id);
        const entries = g.src
            ? listSrcDocs(g.src)
            : listDocFiles(g.id).map((file) => ({ file, doc: path.relative(path.join(ROOT, 'build'), path.dirname(file)).split(path.sep).join('/') }));
        for (const { file, doc, source } of entries) {
            if (!wholeGroup && !matchOnly(only, doc)) continue;
            const root = parse(fs.readFileSync(file, 'utf8'));
            const md = root.querySelector('article .theme-doc-markdown');
            if (!md) continue;
            const title = clean(md.querySelector('header h1')?.text || root.querySelector('title')?.text || doc);
            const chunks = chunkUnits(splitLongUnits(extractUnits(md)), g.articleHeading).map((c, i) => {
                const text = c.parts.join('\n');
                // 整册单文件的书（如慧灯之光）以 articleHeading 级标题为文章名，其下的标题为章节
                const level = g.articleHeading;
                const article = (level && c.path.find(([l]) => l === level)?.[1]) || title;
                const section = c.path
                    .filter(([l]) => !level || l > level)
                    .map(([, t]) => t)
                    .join(' › ');
                return {
                    id: `${doc}#${String(i).padStart(3, '0')}`,
                    cat: g.cat,
                    group: g.id,
                    doc,
                    url: `/${doc}`,
                    title,
                    article,
                    section,
                    pStart: c.pStart,
                    pEnd: c.pEnd,
                    text,
                    // 只用于生成向量：册名、篇名、章节作为上下文前缀；去掉藏文，避免偈颂段落以中等分数混入无关结果
                    embedText: `${g.label}${article.startsWith('《') ? ` ${article}` : `《${article}》`}${section ? ` ${section}` : ''}\n${stripTibetan(text)}`,
                };
            });
            const hash = createHash('sha1')
                .update(JSON.stringify({ v: CHUNK_VERSION, chunks: chunks.map(({ embedText, text, pStart, pEnd, section }) => [embedText, text, pStart, pEnd, section]) }))
                .digest('hex');
            docs.push({ doc, group: g.id, title, hash, chunks, ...(source ? { source } : {}) });
        }
    }
    return docs;
}

export function printStats(docs) {
    const lens = docs.flatMap((d) => d.chunks.map((c) => c.text.length)).sort((a, b) => a - b);
    const n = lens.length;
    if (!n) return console.log('没有可索引的内容');
    const dims = n * DIMENSIONS;
    console.log(`文章 ${docs.length} 篇，块 ${n} 个；长度 最短 ${lens[0]} / 中位 ${lens[n >> 1]} / 最长 ${lens[n - 1]}`);
    console.log(`向量 ${n} 个 × ${DIMENSIONS} 维，原始向量约 ${((dims * 4) / 2 ** 20).toFixed(1)} MiB（Qdrant 中另有 int8 量化副本与正文 payload）`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { only } = parseArgs();
    const docs = buildChunks({ only });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const out = path.join(OUT_DIR, 'chunks.jsonl');
    fs.writeFileSync(out, docs.flatMap((d) => d.chunks).map((c) => JSON.stringify(c)).join('\n') + '\n');
    printStats(docs);
    console.log(`已写入 ${path.relative(ROOT, out)}`);
}
