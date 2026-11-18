import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'hdcx-side-dock-v1';
const DEFAULT_RATIOS = { reader: 0.5, audio: 0.82 };
const TOP_MARGIN = 88;    // 避开顶部 60px 导航栏及安全留白
const BOTTOM_MARGIN = 52; // 避开底部边缘留白
const MIN_GAP = 56;       // 两枚侧边按钮中心最小间距（按钮高约 44~46px，留 ~11px 间隙绝不重叠）
const DRAG_THRESHOLD = 5; // 超过 5px 视为拖拽，否则视为点击
const MIN_PULL_X = -12;   // 拖动一旦开始，至少从右侧边缘向外拉出 12px 呈现完整悬浮钮

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let loaded = false;
let ratios = { ...DEFAULT_RATIOS };
let priorityId = 'reader';
let liveDrag = null; // { id, y }
const activeIds = new Set();
const listeners = new Set();

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (typeof raw.reader === 'number' && raw.reader > 0 && raw.reader < 1) ratios.reader = raw.reader;
      if (typeof raw.audio === 'number' && raw.audio > 0 && raw.audio < 1) ratios.audio = raw.audio;
    }
  } catch (e) {}
}

function saveRatios() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratios));
  } catch (e) {}
}

export function getViewportBounds() {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  const minY = Math.min(TOP_MARGIN, vh / 2);
  const maxY = Math.max(vh - BOTTOM_MARGIN, vh / 2);
  return { vw, vh, minY, maxY };
}

// 解算防重叠位置：primaryY 始终停在目标高度，secondaryY 自动顺向避让；若撞到上下边界则平滑翻越到另一侧
function resolveOverlap(primaryY, secondaryY, minY, maxY, gap) {
  const p = clamp(primaryY, minY, maxY);
  const s = clamp(secondaryY, minY, maxY);
  if (Math.abs(p - s) >= gap) return [p, s];
  const sameSide = p <= s ? p + gap : p - gap;
  if (sameSide >= minY && sameSide <= maxY) return [p, sameSide];
  const oppositeSide = p <= s ? p - gap : p + gap;
  return [p, clamp(oppositeSide, minY, maxY)];
}

function computePositions() {
  ensureLoaded();
  const { vh, minY, maxY } = getViewportBounds();
  const base = {
    reader: clamp(ratios.reader * vh, minY, maxY),
    audio: clamp(ratios.audio * vh, minY, maxY),
  };

  if (liveDrag) {
    const dragId = liveDrag.id;
    const otherId = dragId === 'reader' ? 'audio' : 'reader';
    const pY = clamp(liveDrag.y, minY, maxY);
    if (activeIds.has(otherId)) {
      const [dY, oY] = resolveOverlap(pY, base[otherId], minY, maxY, MIN_GAP);
      return { vh, [dragId]: dY, [otherId]: oY };
    }
    return { vh, ...base, [dragId]: pY };
  }

  if (activeIds.has('reader') && activeIds.has('audio')) {
    const primary = priorityId;
    const secondary = primary === 'reader' ? 'audio' : 'reader';
    const [pY, sY] = resolveOverlap(base[primary], base[secondary], minY, maxY, MIN_GAP);
    return { vh, [primary]: pY, [secondary]: sY };
  }

  return { vh, ...base };
}

function notify() {
  const snapshot = computePositions();
  listeners.forEach((fn) => fn(snapshot));
}

/**
 * 侧边悬浮把手统一拖拽与停靠 Hook（支持拖出边缘、任意高度停靠、双按钮自动防重叠避让）
 */
export function useSideDock(id, { active = true, onDragStart } = {}) {
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState(() => ({ y: 400, vh: 800 }));
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const posRef = useRef(pos);
  posRef.current = pos;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const lastDragEndRef = useRef(0);
  const cleanupDragRef = useRef(null);

  useEffect(() => {
    const update = (snap) => setPos({ y: snap[id], vh: snap.vh });
    listeners.add(update);
    const onResize = () => notify();
    if (listeners.size === 1) {
      window.addEventListener('resize', onResize);
    }
    setReady(true);
    update(computePositions());
    return () => {
      listeners.delete(update);
      if (listeners.size === 0) {
        window.removeEventListener('resize', onResize);
      }
      cleanupDragRef.current?.();
    };
  }, [id]);

  useEffect(() => {
    if (active) activeIds.add(id);
    else activeIds.delete(id);
    notify();
    return () => {
      activeIds.delete(id);
      notify();
    };
  }, [id, active]);

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cleanupDragRef.current?.();

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCenterY = posRef.current.y;
    let dragging = false;
    let currentY = startCenterY;

    const finish = (commit) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      cleanupDragRef.current = null;

      if (!dragging) return;
      lastDragEndRef.current = Date.now();
      setIsDragging(false);
      setDragX(0);

      if (commit) {
        const { vh, minY, maxY } = getViewportBounds();
        const otherId = id === 'reader' ? 'audio' : 'reader';
        const baseOtherY = clamp(ratios[otherId] * vh, minY, maxY);
        if (activeIds.has(otherId)) {
          const [dY, oY] = resolveOverlap(currentY, baseOtherY, minY, maxY, MIN_GAP);
          ratios[id] = dY / vh;
          ratios[otherId] = oY / vh;
        } else {
          ratios[id] = clamp(currentY, minY, maxY) / vh;
        }
        priorityId = id;
        saveRatios();
      }
      liveDrag = null;
      notify();
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        setIsDragging(true);
        onDragStartRef.current?.();
      }
      const { vw, minY, maxY } = getViewportBounds();
      currentY = clamp(startCenterY + dy, minY, maxY);
      // 向左拉出跟随手指（最少脱离边缘 12px），限制不超出屏幕左缘
      const nextPullX = clamp(Math.min(MIN_PULL_X, dx), -(vw - 56), MIN_PULL_X);
      setDragX(nextPullX);
      liveDrag = { id, y: currentY };
      notify();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      finish(true);
    };

    const onCancel = (ev) => {
      if (ev.pointerId !== undefined && ev.pointerId !== pointerId) return;
      finish(true);
    };

    cleanupDragRef.current = () => finish(false);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
  }, [id]);

  const onClickCapture = useCallback((e) => {
    if (Date.now() - lastDragEndRef.current < 320) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return {
    ready,
    y: pos.y,
    vh: pos.vh,
    isDragging,
    dragX,
    bind: {
      onPointerDown,
      onClickCapture,
    },
  };
}
