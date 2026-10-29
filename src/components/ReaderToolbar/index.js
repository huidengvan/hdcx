import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state';
import { useColorMode } from '@docusaurus/theme-common';
import { useLocation } from '@docusaurus/router';
import DownloadSection from './DownloadSection';

// ── 主题配置（背景色 + 文字色）──────────────────────────
export const themes = [
    { id: 'white',  name: '默认白', bg: '#ffffff', text: '#2d2d2d', accent: '#4b5563' },
    { id: 'warm',   name: '暖褐纸', bg: '#FFF2E2', text: '#4a3728', accent: '#8c5e3c' },
    { id: 'green',  name: '护眼绿', bg: '#CCE8CF', text: '#1b4028', accent: '#2e7d32' },
    { id: 'maroon', name: '藏红纸', bg: '#F8EDE8', text: '#381E1C', accent: '#8E2324' },
];

// ── 字体配置（支持系统默认、霞鹜文楷、经典仿宋）────────────
export const fonts = [
    {
        id: 'default',
        name: '系统默认',
        label: '默认',
    },
    {
        id: 'lxgw',
        name: '霞鹜文楷',
        label: '文楷',
        cdnUrl: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css',
        linkId: 'reader-font-lxgw',
    },
    {
        id: 'fangsong',
        name: '经典仿宋',
        label: '仿宋',
        cdnUrl: 'https://cdn.jsdelivr.net/npm/@free-fonts/zhuque-fangsong/zhuque-fangsong.css',
        linkId: 'reader-font-fangsong',
    },
];

// 动态按需加载字体（使用默认字体时不额外发起网络请求，避免影响首屏加载速度）
export const loadFontStylesheet = (fontId) => {
    if (typeof document === 'undefined' || !fontId || fontId === 'default') return;
    const font = fonts.find(f => f.id === fontId);
    if (!font || !font.cdnUrl) return;

    if (!document.getElementById(font.linkId)) {
        // CDN 预连接以减少 DNS 和 TLS 握手耗时
        if (!document.getElementById('reader-font-preconnect')) {
            const preconnect = document.createElement('link');
            preconnect.id = 'reader-font-preconnect';
            preconnect.rel = 'preconnect';
            preconnect.href = 'https://cdn.jsdelivr.net';
            preconnect.crossOrigin = 'anonymous';
            document.head.appendChild(preconnect);
        }

        const link = document.createElement('link');
        link.id = font.linkId;
        link.rel = 'stylesheet';
        link.href = font.cdnUrl;
        document.head.appendChild(link);
    }
};

const FONT_MIN = 12;
const FONT_MAX = 36;
const FONT_STEP = 2;
const FONT_DEFAULT = 16;

export default function ReaderToolbar({ onToggleWidescreen, isWidescreen }) {
    // 默认收起为小 A 悬浮按钮，支持本地持久化记录展开/收起状态
    const [collapsed, setCollapsed] = useLocalStorageState('readerToolbarCollapsed', { defaultValue: true });
    const [themeIndex, setThemeIndex] = useLocalStorageState('readerThemeIndex', { defaultValue: 0 });
    const [fontFamily, setFontFamily] = useLocalStorageState('readerFontFamily', { defaultValue: 'default' });
    const [fontSize, setFontSize] = useLocalStorageState('readerFontSize', { defaultValue: FONT_DEFAULT });
    const [anchorsVisible, setAnchorsVisible] = useLocalStorageState('readerAnchorsVisible', { defaultValue: true });
    const containerRef = useRef(null);
    const location = useLocation();
    // 覆盖 /books, /refs 以及本地常见 /4jx, /5jx, /wsb 等所有文档路径
    const isTargetDoc = /^\/(books|refs|4jx|5jx|wsb)(\/|$)/.test(location.pathname);
    const { colorMode, setColorMode } = useColorMode();

    // 纠正超出当前主题数量的索引（例如历史缓存了 4: 夜间墨）
    const safeThemeIndex = (typeof themeIndex === 'number' && themeIndex >= 0 && themeIndex < themes.length) ? themeIndex : 0;

    // 获取 docRoot DOM 节点
    const getDocRoot = useCallback(() =>
        document.querySelector('[class*=docRoot]'), []);

    // 监听导航栏或其它地方派发的全局阅读主题变更事件
    useEffect(() => {
        const handleExternalThemeChange = (e) => {
            if (e.detail && typeof e.detail.index === 'number') {
                const idx = (e.detail.index >= 0 && e.detail.index < themes.length) ? e.detail.index : 0;
                setThemeIndex(idx);
            }
        };
        window.addEventListener('reader-theme-change', handleExternalThemeChange);
        return () => window.removeEventListener('reader-theme-change', handleExternalThemeChange);
    }, [setThemeIndex]);

    // 应用背景主题
    const applyTheme = useCallback((idx) => {
        const safeIdx = (typeof idx === 'number' && idx >= 0 && idx < themes.length) ? idx : 0;
        const t = themes[safeIdx] || themes[0];

        if (typeof document !== 'undefined') {
            // 设置到全局 <html> 根节点，联动全站（导航栏、卡片、底部、侧边栏、正文）
            document.documentElement.setAttribute('data-reader-theme', t.id);

            // 清理 docRoot 与 article 内联硬编码颜色，让 CSS 变量与主题选择器生效
            const root = getDocRoot();
            if (root) {
                root.style.backgroundColor = '';
                root.setAttribute('data-reader-theme', t.id);
            }
            const article = document.querySelector('article');
            if (article) {
                article.style.color = '';
                article.setAttribute('data-reader-theme', t.id);
            }
        }
        try {
            localStorage.setItem('readerTheme', t.id);
            localStorage.setItem('readerThemeIndex', safeIdx);
            localStorage.setItem('bgColorIndex', safeIdx);
        } catch (e) {}
    }, [getDocRoot]);

    // 应用字体大小
    const applyFontSize = useCallback((size) => {
        const article = document.querySelector('article');
        if (article) article.style.fontSize = `${size}px`;
    }, []);

    // 应用段落锚点显隐
    const applyAnchors = useCallback((visible) => {
        const styleId = 'reader-anchor-hide-style';
        let el = document.getElementById(styleId);
        if (!visible) {
            if (!el) {
                el = document.createElement('style');
                el.id = styleId;
                document.head.appendChild(el);
            }
            el.textContent = 'article p > a[href^="#p"] { display: none !important; }';
        } else {
            el?.remove();
        }
    }, []);

    // 初始化/更新时应用设置
    useEffect(() => {
        applyTheme(safeThemeIndex);
    }, [safeThemeIndex, applyTheme]);

    // 字体变更与按需异步加载
    useEffect(() => {
        if (fontFamily && fontFamily !== 'default') {
            loadFontStylesheet(fontFamily);
        }
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-reader-font', fontFamily || 'default');
        }
    }, [fontFamily]);

    const handleFontFamilyChange = (id) => {
        setFontFamily(id);
        if (id !== 'default') {
            loadFontStylesheet(id);
        }
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-reader-font', id);
        }
    };

    useEffect(() => {
        applyFontSize(fontSize);
    }, [fontSize, applyFontSize]);

    useEffect(() => {
        applyAnchors(anchorsVisible);
    }, [anchorsVisible, applyAnchors]);

    // 点击外部区域自动收起面板，提升阅读体验
    useEffect(() => {
        if (collapsed) return;
        const handleOutsideClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setCollapsed(true);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setCollapsed(true);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [collapsed, setCollapsed]);

    const handleThemeChange = (idx) => {
        const safeIdx = (typeof idx === 'number' && idx >= 0 && idx < themes.length) ? idx : 0;
        // 如果当前是夜间模式，切换到指定纸张主题时，退出夜间模式，确保纸张色彩全站生效
        if (colorMode === 'dark') {
            setColorMode('light');
        }
        setThemeIndex(safeIdx);
        applyTheme(safeIdx);
        window.dispatchEvent(new CustomEvent('reader-theme-change', { detail: { index: safeIdx, id: themes[safeIdx].id } }));
    };

    // 监听全局派发的阅读字号变更事件
    useEffect(() => {
        const handleExternalFontSize = (e) => {
            if (e.detail && typeof e.detail.size === 'number') {
                setFontSize(e.detail.size);
            }
        };
        window.addEventListener('reader-fontsize-change', handleExternalFontSize);
        return () => window.removeEventListener('reader-fontsize-change', handleExternalFontSize);
    }, [setFontSize]);

    const handleFontSize = (delta) => {
        setFontSize(prev => {
            const next = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta));
            window.dispatchEvent(new CustomEvent('reader-fontsize-change', { detail: { size: next } }));
            return next;
        });
    };

    const handleResetFont = () => {
        setFontSize(FONT_DEFAULT);
        window.dispatchEvent(new CustomEvent('reader-fontsize-change', { detail: { size: FONT_DEFAULT } }));
    };

    const toggleAnchors = () => setAnchorsVisible(prev => !prev);

    // 宽屏切换处理
    const handleWidescreenClick = () => {
        if (onToggleWidescreen) {
            onToggleWidescreen();
        } else {
            // 回退直接操作 DOM
            const articleCol = document.querySelector('article')?.parentElement?.parentElement;
            const tocNode = document.querySelector('.theme-doc-toc-desktop');
            if (!articleCol) return;
            if (articleCol.className === '') {
                if (tocNode) tocNode.style.display = '';
                articleCol.className = 'col docItemCol_node_modules-@docusaurus-theme-classic-lib-theme-DocItem-Layout-styles-module';
                articleCol.style.fontSize = '';
            } else {
                if (tocNode) tocNode.style.display = 'none';
                articleCol.className = '';
                articleCol.style.fontSize = '';
            }
            const sidebarButton = document.querySelector('[class*="collapseSidebarButton"]');
            sidebarButton?.click();
        }
    };

    // 检查宽屏状态
    const widescreenActive = isWidescreen !== undefined
        ? isWidescreen
        : (typeof document !== 'undefined' && document.querySelector('article')?.parentElement?.parentElement?.className === '');

    const isDark = colorMode === 'dark';
    const currentTheme = themes[safeThemeIndex] || themes[0];
    const currentThemeLabel = (isDark && safeThemeIndex === 0) ? '夜间模式' : currentTheme.name;

    return (
        <div ref={containerRef} id="reader-toolbar-root" className={`${styles.container} reader-toolbar-global no-print`}>
            {/* 收起状态：右侧边缘仅展示简洁小巧的 'A' 按钮 */}
            {collapsed && (
                <button
                    className={styles.fabTrigger}
                    onClick={() => setCollapsed(false)}
                    title="阅读设置"
                    aria-label="打开阅读设置"
                >
                    <span className={styles.fabLetter}>A</span>
                </button>
            )}

            {/* 展开状态：紧凑现代的阅读设置面板 */}
            {!collapsed && (
                <div className={styles.panel}>
                    {/* 面板头部 */}
                    <div className={styles.header}>
                        <span className={styles.headerTitle}>阅读设置</span>
                        <button
                            className={styles.closeBtn}
                            onClick={() => setCollapsed(true)}
                            title="收起 (Esc)"
                            aria-label="收起面板"
                        >
                            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    {/* 1. 主题配色 */}
                    <div className={styles.section}>
                        <div className={styles.sectionLabelRow}>
                            <span className={styles.label}>主题</span>
                            <span className={styles.subLabel}>{currentThemeLabel}</span>
                        </div>
                        <div className={styles.themeRow}>
                            {themes.map((t, i) => {
                                const isActive = isDark ? (i === 0 && safeThemeIndex === 0) : (safeThemeIndex === i);
                                return (
                                    <button
                                        key={t.name}
                                        data-theme-id={t.id}
                                        className={`${styles.themeBtn} ${isActive ? styles.themeBtnActive : ''} ${isDark && isActive ? styles.themeBtnDarkActive : ''}`}
                                        style={{
                                            backgroundColor: t.bg === 'white' ? '#fff' : t.bg,
                                        }}
                                        onClick={() => handleThemeChange(i)}
                                        title={t.name}
                                        aria-label={`主题：${t.name}`}
                                        aria-pressed={isActive}
                                    >
                                        {isActive && (
                                            <svg
                                                className={styles.themeCheckIcon}
                                                viewBox="0 0 16 16"
                                                fill="none"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M3.5 8.5L6.5 11.5L12.5 4.5"
                                                    stroke="currentColor"
                                                    strokeWidth="2.2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.divider} />

                    {/* 2. 字体选择（系统默认、霞鹜文楷、经典仿宋） */}
                    <div className={styles.section}>
                        <div className={styles.sectionLabelRow}>
                            <span className={styles.label}>字体</span>
                            <span className={styles.subLabel}>
                                {fonts.find(f => f.id === fontFamily)?.name || '系统默认'}
                            </span>
                        </div>
                        <div className={styles.fontFamilyRow}>
                            {fonts.map((f) => (
                                <button
                                    key={f.id}
                                    className={`${styles.fontFamilyBtn} ${fontFamily === f.id ? styles.fontFamilyBtnActive : ''}`}
                                    onClick={() => handleFontFamilyChange(f.id)}
                                    title={f.name}
                                    aria-label={`切换字体：${f.name}`}
                                    aria-pressed={fontFamily === f.id}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.divider} />

                    {/* 3. 字号调整 */}
                    <div className={styles.section}>
                        <div className={styles.sectionLabelRow}>
                            <span className={styles.label}>字号</span>
                            <span className={styles.subLabel}>{fontSize}px</span>
                        </div>
                        <div className={styles.fontStepper}>
                            <button
                                className={styles.fontStepBtn}
                                onClick={() => handleFontSize(-FONT_STEP)}
                                disabled={fontSize <= FONT_MIN}
                                title="缩小字号 (-2px)"
                                aria-label="缩小字号"
                            >
                                A-
                            </button>
                            <button
                                className={styles.fontResetBtn}
                                onClick={handleResetFont}
                                title="恢复默认 16px"
                                aria-label="恢复默认字号"
                            >
                                默认
                            </button>
                            <button
                                className={styles.fontStepBtn}
                                onClick={() => handleFontSize(FONT_STEP)}
                                disabled={fontSize >= FONT_MAX}
                                title="放大字号 (+2px)"
                                aria-label="放大字号"
                            >
                                A+
                            </button>
                        </div>
                    </div>

                    <div className={styles.divider} />

                    {/* 3. 视图开关（宽屏 Alt+T + 段落号显隐） */}
                    <div className={styles.section}>
                        <span className={styles.label}>视图</span>
                        <div className={styles.toggleGrid}>
                            {/* 宽屏按钮 */}
                            <button
                                className={`${styles.toggleCard} ${widescreenActive ? styles.toggleCardActive : ''}`}
                                onClick={handleWidescreenClick}
                                title="宽屏阅读 (Alt + T)"
                                aria-pressed={widescreenActive}
                            >
                                <svg className={styles.toggleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>宽屏</span>
                            </button>

                            {/* 段落标记显隐按钮 */}
                            <button
                                className={`${styles.toggleCard} ${anchorsVisible ? styles.toggleCardActive : ''}`}
                                onClick={toggleAnchors}
                                title={anchorsVisible ? '点击隐藏段落号' : '点击显示段落号'}
                                aria-pressed={anchorsVisible}
                            >
                                <svg className={styles.toggleIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span>段落号</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. 下载本篇（离线阅读专区） */}
                    {isTargetDoc && (
                        <>
                            <div className={styles.divider} />
                            <DownloadSection onRequestClose={() => setCollapsed(true)} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
