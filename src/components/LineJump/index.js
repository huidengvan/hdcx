import React, { useEffect, useRef, useState } from 'react';
import styles from './index.module.css';

const GUTTER = 56; // 正文左侧可触发图标的区域宽度
const ICON_SIZE = 18;
const ICON_WIDTH = 13;
export const LINE_PAGE_GAP = 8; // 翻页后衔接行距视口顶部/底部的留白
const ZONE_LINES = 3; // 视口底部可触发的行数
const TEXT_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td';

// 获取视口坐标处的文字插入点（Firefox 用 caretPositionFromPoint，Chrome/Safari 用 caretRangeFromPoint）
function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    return pos && { node: pos.offsetNode, offset: pos.offset };
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    return range && { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

// 计算 y 所在视觉行（折行后的行）的行盒，非正文文字或段落间隙返回 null
export function getLineAt(content, y) {
  const rect = content.getBoundingClientRect();
  const caret = caretAt(rect.left + Math.min(rect.width / 3, 60), y);
  const node = caret?.node;
  if (!node || node.nodeType !== Node.TEXT_NODE || !node.length) return null;
  const block = node.parentElement?.closest(TEXT_SELECTOR);
  if (!block || !content.contains(block)) return null;

  // 取插入点前后各一个字的矩形，挑出包含 y 的那一行（插入点位于行尾时前后两字可能分属两行）
  const range = document.createRange();
  range.setStart(node, Math.max(0, caret.offset - 1));
  range.setEnd(node, Math.min(node.length, caret.offset + 1));
  const charRect = Array.from(range.getClientRects()).find((r) => y >= r.top - 4 && y <= r.bottom + 4);
  if (!charRect) return null;

  const lineHeight = parseFloat(getComputedStyle(block).lineHeight) || charRect.height * 1.6;
  const top = (charRect.top + charRect.bottom) / 2 - lineHeight / 2;
  if (y < top || y > top + lineHeight) return null;
  return { top, height: lineHeight };
}

// 在文档坐标中叠加一条短暂高亮的色条，不改动正文 DOM
let activeFlash = null;
function flashLine(docTop, height, left, width) {
  activeFlash?.remove();
  const el = document.createElement('div');
  el.className = styles.flash;
  Object.assign(el.style, {
    top: `${docTop}px`,
    left: `${left - 6}px`,
    width: `${width + 12}px`,
    height: `${height}px`,
  });
  el.addEventListener('animationend', () => {
    el.remove();
    if (activeFlash === el) activeFlash = null;
  });
  document.body.appendChild(el);
  activeFlash = el;
}

// 从 fromY 向 toY 逐点探测，返回遇到的第一条正文视觉行（跳过段落间隙、图片等）
export function findLine(content, fromY, toY, step = 6) {
  const dir = toY >= fromY ? 1 : -1;
  for (let y = fromY; dir > 0 ? y <= toY : y >= toY; y += dir * step) {
    const box = getLineAt(content, y);
    if (box) return box;
  }
  return null;
}

// 高亮视口坐标下的某一视觉行
export function highlightLine(content, box) {
  const rect = content.getBoundingClientRect();
  flashLine(box.top + window.scrollY, box.height, rect.left, rect.width);
}

// 视口底部几行左侧悬停出现定位图标，点击后将该行翻到页面顶部并短暂高亮，便于接续阅读
export default function LineJump() {
  const [line, setLine] = useState(null);
  const lineRef = useRef(null);

  useEffect(() => {
    // 仅桌面端（有鼠标悬停）启用
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    let mouse = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const content = document.querySelector('article .markdown');
      let next = null;
      if (content && mouse) {
        const rect = content.getBoundingClientRect();
        if (mouse.x >= rect.left - GUTTER && mouse.x <= rect.left + 24) {
          const box = getLineAt(content, mouse.y);
          if (box && box.top + box.height / 2 > window.innerHeight - ZONE_LINES * box.height) {
            next = {
              ...box,
              iconLeft: Math.max(4, rect.left - ICON_WIDTH - 2),
              contentLeft: rect.left,
              contentWidth: rect.width,
            };
          }
        }
      }
      lineRef.current = next;
      setLine((prev) => (prev && next && prev.top === next.top && prev.iconLeft === next.iconLeft ? prev : next));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onMove = (e) => {
      mouse = { x: e.clientX, y: e.clientY };
      schedule();
    };
    const onLeave = () => {
      mouse = null;
      schedule();
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', schedule);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const handleJump = () => {
    const box = lineRef.current;
    if (!box) return;
    flashLine(box.top + window.scrollY, box.height, box.contentLeft, box.contentWidth);
    // 向下滚动时导航栏会自动隐藏，无需扣除其高度
    window.scrollBy({ top: box.top - LINE_PAGE_GAP, behavior: 'smooth' });
  };

  if (!line) return null;

  return (
    <button
      type="button"
      className={styles.icon}
      style={{ top: line.top + line.height / 2 - ICON_SIZE / 2, left: line.iconLeft }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleJump}
      title="将此行翻到顶部"
      aria-label="将此行翻到顶部"
    >
      {/* 置顶箭头：横线 + 向上箭头 */}
      <svg viewBox="4 1 16 22" width={ICON_WIDTH} height={ICON_SIZE} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 3h14" />
        <path d="M12 21V8" />
        <path d="M6 13l6-6 6 6" />
      </svg>
    </button>
  );
}
