/**
 * 音频字幕与正文同步：字幕放在音频同目录、同名、后缀 .srt（scripts/align_srt.py 生成，文字取自文稿）。
 * 字幕条按文字在正文里定位成 Range，用 CSS Custom Highlight API 加下划线，不改动 React 管理的 DOM。
 */

import { mediaSources } from './mediaSources';

const HIGHLIGHT_NAME = 'audio-subtitle';

// 音频卡片之后、到下一个音频卡片为止，是这段音频的正文：录音可能跨过同级标题，字幕文字都在这个范围内（align_srt.py 取的是其中朗读的部分）
const SKIP_SELECTOR = 'a[data-footnote-ref], [data-footnotes], .hash-link, script, style, button, svg';

const zhNum = (s) => {
  if (s.includes('尾义')) return 29;
  const m = /第(二十|十)?([一二三四五六七八九])?/.exec(s);
  return m ? (m[1] === '二十' ? 20 : m[1] === '十' ? 10 : 0) + Math.max(0, ' 一二三四五六七八九'.indexOf(m[2] || ' ')) : 0;
};

export function srtUrlFor(src) {
  const dec = decodeURI(src);
  let m = /《慧灯之光》系列\/《慧灯之光》(\d+)\/([^/?#]+)\.[^./?#]+/.exec(dec);
  if (m) return `https://s3.ap-northeast-1.wasabisys.com/hdcx/hdv/docs/慧灯之光有声书1-10册字幕/${m[1].padStart(2, '0')}/${encodeURIComponent(m[2])}.srt`;
  m = /《慧灯之光》系列\/十一册十二册合集\/([^/?#]+)\.[^./?#]+/.exec(dec);
  if (m) {
    const n = zhNum(m[1]);
    const prefix = n ? `${String(n).padStart(2, '0')} ` : '';
    return `https://s3.ap-northeast-1.wasabisys.com/hdcx/hdv/a/sound/宝鬘庄严论/${encodeURIComponent(prefix + m[1])}.srt`;
  }
  return src.replace(/(\.[^./?#]*)?([?#].*)?$/, '.srt$2');
}

const toSeconds = (h, m, s, ms) => (+h) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
const TIME_LINE = /(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;

export function parseSrt(text) {
  const cues = [];
  for (const block of text.replace(/^﻿/, '').split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const i = lines.findIndex((l) => TIME_LINE.test(l));
    if (i < 0) continue;
    const t = TIME_LINE.exec(lines[i]);
    const body = lines.slice(i + 1).join('').trim();
    if (body) cues.push({ start: toSeconds(t[1], t[2], t[3], t[4]), end: toSeconds(t[5], t[6], t[7], t[8]), text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

const subtitleCache = new Map();

// 依次走各条线路；404 说明确实没有字幕，不用再试，其他失败才换线路
async function fetchSrt(src) {
  for (const { url } of mediaSources(srtUrlFor(src))) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      if (res.status === 404) return '';
    } catch (e) {}
  }
  return '';
}

// 取字幕；没有字幕（404、跨域失败、内容不是 SRT）时返回 null，结果按音频地址缓存
export function loadSubtitles(src) {
  if (!subtitleCache.has(src)) {
    subtitleCache.set(src, fetchSrt(src).then((text) => {
      const cues = parseSrt(text);
      return cues.length ? cues : null;
    }));
  }
  return subtitleCache.get(src);
}

// 当前时间所在的字幕条：开始时间不晚于当前时间的最后一条（两条之间的停顿仍停在上一条）
export function findCueIndex(cues, time) {
  if (!cues?.length || time < cues[0].start) return -1;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cues[mid].start <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// 只比对汉字、字母、数字：标点、空白、md 标记的差异都不影响定位
function normChar(c) {
  const code = c.charCodeAt(0);
  if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xfee0);
  if ((code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)) {
    return String.fromCharCode(code - 0xfee0).toLowerCase();
  }
  if ((code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a)) return c;
  if (code >= 0x41 && code <= 0x5a) return c.toLowerCase();
  if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) return c;
  return '';
}

function normalize(text) {
  let out = '';
  for (const c of text) out += normChar(c);
  return out;
}

// 音频卡片对应的正文：规范化后的字符串，及每个字所在的文本节点和偏移
function collectSection(cardEl) {
  const root = cardEl.closest('.markdown') || cardEl.parentElement;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (
      cardEl.contains(node) || (node.nodeType === 1 && node.matches(SKIP_SELECTOR))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    ),
  });
  walker.currentNode = cardEl;

  const textNodes = [];
  const nodeIndex = [];
  const offsets = [];
  let norm = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      if (node.hasAttribute('data-audio-section')) break;
      continue;
    }
    const value = node.nodeValue;
    for (let i = 0; i < value.length; i++) {
      const k = normChar(value[i]);
      if (!k) continue;
      norm += k;
      nodeIndex.push(textNodes.length);
      offsets.push(i);
    }
    textNodes.push(node);
  }
  return { norm, textNodes, nodeIndex, offsets };
}

function occurrences(norm, s) {
  const found = [];
  for (let p = norm.indexOf(s); p >= 0; p = norm.indexOf(s, p + 1)) found.push(p);
  return found;
}

// 字幕偶有与正文对不上的字时，在 [from, to) 内按首尾各几个字定位
function findLoose(norm, s, from, to) {
  if (s.length < 8) return null;
  const head = s.slice(0, 4);
  const tail = s.slice(-4);
  const p = norm.indexOf(head, from);
  if (p < 0) return null;
  const q = norm.indexOf(tail, p + head.length);
  const end = q + tail.length;
  return q >= 0 && end <= to && end - p <= s.length * 1.5 ? [p, end] : null;
}

// 每条字幕在正文中的 [起, 止)，找不到为 null。
// 字幕按时间走，下划线在正文里只能往后：相同的句子可能出现多次，所以不逐条就近找，而是在所有出现位置里
// 取能串起最多字幕、前后不重叠的一条链，同样长时取靠前的。串不进去的字幕只在前后两条之间找，不会跳到别处
function locateCues(cues, norm) {
  const texts = cues.map(({ text }) => normalize(text));
  const tailEnd = []; // tailEnd[k]：长度 k+1 的链最靠前的结束位置
  const tail = [];
  texts.forEach((s, i) => {
    if (!s) return;
    const found = occurrences(norm, s);
    for (let n = found.length - 1; n >= 0; n--) { // 从后往前，同一条字幕的几处不会互相接上
      const p = found[n];
      const end = p + s.length;
      let lo = 0;
      let hi = tailEnd.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tailEnd[mid] <= p) lo = mid + 1;
        else hi = mid;
      }
      if (lo === tailEnd.length || end < tailEnd[lo]) {
        tailEnd[lo] = end;
        tail[lo] = { i, p, end, prev: lo ? tail[lo - 1] : null };
      }
    }
  });

  const locs = new Array(cues.length).fill(null);
  for (let node = tail[tail.length - 1]; node; node = node.prev) locs[node.i] = [node.p, node.end];

  const limits = new Array(cues.length);
  let next = norm.length;
  for (let i = cues.length - 1; i >= 0; i--) {
    limits[i] = next;
    if (locs[i]) next = locs[i][0];
  }
  let from = 0;
  locs.forEach((loc, i) => {
    const found = loc || findLoose(norm, texts[i], from, limits[i]);
    locs[i] = found;
    if (found) from = found[1];
  });
  return locs;
}

/** 把字幕对到音频卡片下的正文；rangeAt(i) 取第 i 条（找不到时退回前面最近一条能定位的） */
export function alignSection(cardEl, cues) {
  const section = collectSection(cardEl);
  const locs = locateCues(cues, section.norm);
  return {
    cardEl,
    cues,
    isConnected: () => cardEl.isConnected && section.textNodes.every((n) => n.isConnected),
    rangeAt(index) {
      let i = index;
      while (i >= 0 && !locs[i]) i--;
      if (i < 0) return null;
      const [a, b] = locs[i];
      const { textNodes, nodeIndex, offsets } = section;
      const range = document.createRange();
      range.setStart(textNodes[nodeIndex[a]], offsets[a]);
      range.setEnd(textNodes[nodeIndex[b - 1]], offsets[b - 1] + 1);
      return range;
    },
  };
}

const highlightSupported = () => typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

export function showCueHighlight(range) {
  if (highlightSupported()) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
}

export function clearCueHighlight() {
  if (highlightSupported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}

// 当前句各行的矩形，换成相对整个文档的坐标：页面滚动后仍然有效，只在换句或排版变化时才需要重算
export function documentRects(range) {
  const sx = window.scrollX;
  const sy = window.scrollY;
  return Array.from(range.getClientRects(), (r) => ({
    left: r.left + sx,
    right: r.right + sx,
    top: r.top + sy,
    bottom: r.bottom + sy,
  }));
}

// 点击、悬停是否落在当前句上（上下各放宽几像素，行间空隙也算）
export function hitRects(rects, pageX, pageY) {
  return rects.some((r) => pageX >= r.left && pageX <= r.right && pageY >= r.top - 3 && pageY <= r.bottom + 3);
}

// 翻页：当前句跑出阅读区（导航栏下到视口下部）时，滚到视口上部，接着往下读
export function followRange(range) {
  const rects = range.getClientRects();
  if (!rects.length) return;
  const top = rects[0].top;
  const bottom = rects[rects.length - 1].bottom;
  const navbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ifm-navbar-height')) || 60;
  const viewH = window.innerHeight;
  if (top >= navbar + 8 && bottom <= viewH * 0.8) return;
  window.scrollTo({ top: window.scrollY + top - navbar - viewH * 0.18, behavior: 'smooth' });
}
