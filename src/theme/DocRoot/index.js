import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { locateParagraph, highlightParagraph } from '@site/src/utils';
import useLocalStorageState from 'use-local-storage-state';
import ReaderToolbar from '../../components/ReaderToolbar';

export default function DocRootWrapper(props) {
  const location = useLocation();

  const [fontSize, setFontSize] = useLocalStorageState('readerFontSize', { defaultValue: 16 });
  const [isWidescreen, setIsWidescreen] = useState(false);
  const isWidescreenRef = useRef(isWidescreen);
  isWidescreenRef.current = isWidescreen;

  // 获取视口内当前正在阅读的段落及距离视口顶部的偏移
  const getVisibleParagraph = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const article = document.querySelector('article');
    if (!article) return null;
    const paras = Array.from(article.querySelectorAll('p[id], p, h1, h2, h3, h4'));
    if (!paras.length) return null;

    const headerOffset = 75; // 顶部导航栏高度 (~60px) + 间距

    // 1. 如果有段落正好对齐在阅读参考线顶部（rect.top 在 headerOffset ± 25px 之间）
    for (const p of paras) {
      const rect = p.getBoundingClientRect();
      if (Math.abs(rect.top - headerOffset) <= 25) {
        return { el: p, top: rect.top };
      }
    }

    // 2. 寻找跨越阅读参考线且有实质文字可见的段落（下方可见高度 > 30px，避免仅剩数像素底边距的已滚出段落）
    for (const p of paras) {
      const rect = p.getBoundingClientRect();
      if (rect.top < headerOffset && rect.bottom > headerOffset + 30) {
        return { el: p, top: rect.top };
      }
    }

    // 3. 寻找参考线下方视口内的第一个段落
    for (const p of paras) {
      const rect = p.getBoundingClientRect();
      if (rect.top >= headerOffset && rect.top <= window.innerHeight * 0.6) {
        return { el: p, top: rect.top };
      }
    }

    // 4. 点检测回退
    const elAtPoint = document.elementFromPoint(window.innerWidth / 2, headerOffset + 30);
    const pClosest = elAtPoint?.closest('p, h1, h2, h3, h4');
    if (pClosest) {
      return { el: pClosest, top: pClosest.getBoundingClientRect().top };
    }

    return { el: paras[0], top: headerOffset };
  }, []);

  // 获取当前视口底部即将翻到下一页顶部的段落
  const getBottomParagraph = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const article = document.querySelector('article');
    if (!article) return null;
    const paras = Array.from(article.querySelectorAll('p[id], p, h1, h2, h3, h4'));
    if (!paras.length) return null;

    const headerOffset = 75;
    const bottomThreshold = window.innerHeight - 80;

    // 1. 优先寻找位于当前视口下半部分、且最接近底部边界的段落
    // 关键排查：过滤掉起始位置在当前视口顶部的段落（rect.top <= headerOffset + 80），
    // 杜绝大字号下一个超长段落占满全屏时，被误判为“底部段落”导致翻页后滚出视口上方仍被高亮。
    for (let i = paras.length - 1; i >= 0; i--) {
      const p = paras[i];
      const rect = p.getBoundingClientRect();
      if (rect.top > headerOffset + 80 && rect.top <= bottomThreshold) {
        return p;
      }
    }

    // 2. 如果视口内下半部没有新段落开始，寻找紧随视口底部边缘下方的第一个段落
    for (const p of paras) {
      const rect = p.getBoundingClientRect();
      if (rect.top > bottomThreshold && rect.top <= window.innerHeight + 100) {
        return p;
      }
    }

    return null;
  }, []);

  // 获取上一页即将翻到当前顶部位置的段落
  const getPrevPageParagraph = useCallback(() => {
    if (typeof document === 'undefined') return null;
    const article = document.querySelector('article');
    if (!article) return null;
    const paras = Array.from(article.querySelectorAll('p[id], p, h1, h2, h3, h4'));
    if (!paras.length) return null;

    const headerOffset = 75;
    const targetTop = headerOffset - (window.innerHeight - 100);
    let best = null;
    let minDiff = Infinity;
    for (const p of paras) {
      const rect = p.getBoundingClientRect();
      // 只考虑目前位于视口顶部上方的段落
      if (rect.top < headerOffset - 20) {
        const diff = Math.abs(rect.top - targetTop);
        if (diff < minDiff) {
          minDiff = diff;
          best = p;
        }
      }
    }
    return best;
  }, []);

  // 宽屏模式切换处理：精确定位当前段落，避免跳跃；字号在宽屏模式下无缝累加
  const handleWidescreen = useCallback(() => {
    const articleCol = document.querySelector('article')?.parentElement?.parentElement;
    if (!articleCol) return;
    const tocNode = document.querySelector('.theme-doc-toc-desktop');

    // 1. 记录切换前正在阅读的段落位置
    const visibleInfo = getVisibleParagraph();
    const targetEl = visibleInfo?.el;
    const initialTop = visibleInfo?.top || 75;

    const enteringWidescreen = articleCol.className !== '';

    if (!enteringWidescreen) {
      // 退出宽屏模式
      if (tocNode) tocNode.style.display = '';
      articleCol.className = 'col docItemCol_node_modules-@docusaurus-theme-classic-lib-theme-DocItem-Layout-styles-module';
      articleCol.style.fontSize = '';
      setIsWidescreen(false);

      // 恢复进入宽屏前的字号
      try {
        const preSizeStr = sessionStorage.getItem('preWidescreenFontSize');
        const preSize = preSizeStr ? parseInt(preSizeStr, 10) : 16;
        setFontSize(preSize);
        const article = document.querySelector('article');
        if (article) article.style.fontSize = `${preSize}px`;
        window.dispatchEvent(new CustomEvent('reader-fontsize-change', { detail: { size: preSize } }));
      } catch (e) {}
    } else {
      // 进入宽屏模式
      if (tocNode) tocNode.style.display = 'none';
      articleCol.className = '';
      articleCol.style.fontSize = '';
      setIsWidescreen(true);

      // 备份当前字号，并将宽屏基准字号设为 24px（若原本已大于24px则保持），后续点击 A+ 可在其基础上继续递增
      try {
        sessionStorage.setItem('preWidescreenFontSize', String(fontSize));
        const enlargedSize = Math.max(fontSize, 24);
        setFontSize(enlargedSize);
        const article = document.querySelector('article');
        if (article) article.style.fontSize = `${enlargedSize}px`;
        window.dispatchEvent(new CustomEvent('reader-fontsize-change', { detail: { size: enlargedSize } }));
      } catch (e) {}
    }

    const sidebarButton = document.querySelector('[class*="collapseSidebarButton"]');
    sidebarButton?.click();

    // 2. 动画与重排后精准校准阅读位置回到原段落
    const restoreScroll = () => {
      if (targetEl && targetEl.isConnected) {
        const rect = targetEl.getBoundingClientRect();
        const idealTop = Math.max(65, Math.min(initialTop, 120));
        const diff = rect.top - idealTop;
        if (Math.abs(diff) > 2) {
          window.scrollBy(0, diff);
        }
      }
    };

    requestAnimationFrame(restoreScroll);
    setTimeout(restoreScroll, 60);
    setTimeout(restoreScroll, 160);
    setTimeout(() => {
      restoreScroll();
      if (targetEl) {
        highlightParagraph(targetEl, 2000);
      }
    }, 280);
  }, [fontSize, setFontSize, getVisibleParagraph]);


  // 键盘左右方向键翻页：精准翻到下一段或上一段并高亮提示
  const handleKeyDown = useCallback((event) => {
    // 忽略在输入框内的按键
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if ((event.altKey || event.metaKey) && key === 't') {
      event.preventDefault();
      handleWidescreen();
    } else if (event.key === 'ArrowUp') {
      sessionStorage.setItem('scrollBlock', 'end');
    } else if (event.key === 'ArrowDown') {
      sessionStorage.setItem('scrollBlock', 'start');
    } else if (event.key === 'ArrowLeft') {
      // 往上翻一页：从上一页对应位置定位并高亮翻页后位于顶部的段落
      event.preventDefault();
      const targetP = getPrevPageParagraph();
      const scrollDist = targetP ? targetP.getBoundingClientRect().top - 75 : (100 - window.innerHeight);
      const actualScroll = Math.abs(scrollDist) > 30 ? scrollDist : (100 - window.innerHeight);

      window.scrollBy({ top: actualScroll, behavior: 'smooth' });

      // 翻页滚动完成后，准确检测位于视口顶部的真实可见段落并予以高亮（杜绝高亮不可见段落）
      setTimeout(() => {
        if (targetP && targetP.isConnected) {
          const r = targetP.getBoundingClientRect();
          if (r.bottom > 75 && r.top < window.innerHeight && r.top >= 40 && r.top <= 220) {
            highlightParagraph(targetP, 2500);
            return;
          }
        }
        const topInfo = getVisibleParagraph();
        if (topInfo?.el) {
          highlightParagraph(topInfo.el, 2500);
        }
      }, 280);
    } else if (event.key === 'ArrowRight') {
      // 往下翻一页：从当前页底部的段落开始定位到翻页后的顶部，并给予视觉高亮提示
      event.preventDefault();
      const targetP = getBottomParagraph();
      const scrollDist = targetP ? targetP.getBoundingClientRect().top - 75 : (window.innerHeight - 100);
      const actualScroll = scrollDist > 40 ? scrollDist : (window.innerHeight - 100);

      window.scrollBy({ top: actualScroll, behavior: 'smooth' });

      // 翻页滚动完成后，准确检测位于视口顶部的真实可见段落并予以高亮（杜绝高亮不可见段落）
      setTimeout(() => {
        if (targetP && targetP.isConnected) {
          const r = targetP.getBoundingClientRect();
          if (r.bottom > 75 && r.top < window.innerHeight && r.top >= 40 && r.top <= 220) {
            highlightParagraph(targetP, 2500);
            return;
          }
        }
        const topInfo = getVisibleParagraph();
        if (topInfo?.el) {
          highlightParagraph(topInfo.el, 2500);
        }
      }, 280);
    }
  }, [handleWidescreen, getVisibleParagraph, getBottomParagraph, getPrevPageParagraph]);

  useEffect(() => {
    const articleTitle = decodeURI(location.hash?.slice(1));
    if (articleTitle) {
      locateParagraph(articleTitle);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, location.hash]);

  useEffect(() => {
    const hash = decodeURI(location.hash?.slice(1));
    if (hash) {
      locateParagraph(hash);
    }
  }, [location.hash, location.pathname]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = decodeURI(window.location.hash?.slice(1));
      if (hash) {
        locateParagraph(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <>
      <ReaderToolbar
        onToggleWidescreen={handleWidescreen}
        isWidescreen={isWidescreen}
      />
      <DocRoot {...props} />
    </>
  );
}
