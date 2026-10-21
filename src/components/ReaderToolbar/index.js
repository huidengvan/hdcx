import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state';

// ── 主题配置（背景色 + 文字色）──────────────────────────
export const themes = [
    { id: 'white',  name: '默认白', bg: 'white',   text: '#2d2d2d' },
    { id: 'warm',   name: '暖褐纸', bg: '#FFF2E2', text: '#4a3728' },
    { id: 'green',  name: '护眼绿', bg: '#CCE8CF', text: '#1e4030' },
    { id: 'yellow', name: '淡黄纸', bg: '#FAF9DE', text: '#3d3a10' },
    { id: 'dark',   name: '夜间墨', bg: '#1e1e2e', text: '#cdd6f4' },
];

const FONT_MIN = 12;
const FONT_MAX = 28;
const FONT_STEP = 2;
const FONT_DEFAULT = 16;

export default function ReaderToolbar({ onToggleWidescreen, isWidescreen }) {
    // 默认收起为小 A 悬浮按钮，支持本地持久化记录展开/收起状态
    const [collapsed, setCollapsed] = useLocalStorageState('readerToolbarCollapsed', { defaultValue: true });
    const [themeIndex, setThemeIndex] = useLocalStorageState('readerThemeIndex', { defaultValue: 0 });
    const [fontSize, setFontSize] = useLocalStorageState('readerFontSize', { defaultValue: FONT_DEFAULT });
    const [anchorsVisible, setAnchorsVisible] = useLocalStorageState('readerAnchorsVisible', { defaultValue: true });
    const containerRef = useRef(null);

    // 获取 docRoot DOM 节点
    const getDocRoot = useCallback(() =>
        document.querySelector('[class*=docRoot]'), []);

    // 应用背景主题
    const applyTheme = useCallback((idx) => {
        const root = getDocRoot();
        if (!root) return;
        const t = themes[idx] || themes[0];
        root.style.backgroundColor = t.bg;
        root.setAttribute('data-reader-theme', t.id);

        // 同步更新 article 内文字色与主题属性
        const article = document.querySelector('article');
        if (article) {
            article.style.color = t.text;
            article.setAttribute('data-reader-theme', t.id);
        }
        localStorage.setItem('bgColorIndex', idx);
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
        applyTheme(themeIndex);
    }, [themeIndex, applyTheme]);

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
        setThemeIndex(idx);
    };

    const handleFontSize = (delta) => {
        setFontSize(prev => {
            const next = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta));
            return next;
        });
    };

    const handleResetFont = () => setFontSize(FONT_DEFAULT);

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
                articleCol.style.fontSize = 'x-large';
            }
            const sidebarButton = document.querySelector('[class*="collapseSidebarButton"]');
            sidebarButton?.click();
        }
    };

    // 检查宽屏状态
    const widescreenActive = isWidescreen !== undefined
        ? isWidescreen
        : (typeof document !== 'undefined' && document.querySelector('article')?.parentElement?.parentElement?.className === '');

    const currentTheme = themes[themeIndex] || themes[0];

    return (
        <div ref={containerRef} className={styles.container}>
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
                            <span className={styles.subLabel}>{currentTheme.name}</span>
                        </div>
                        <div className={styles.themeRow}>
                            {themes.map((t, i) => (
                                <button
                                    key={t.name}
                                    className={`${styles.themeBtn} ${themeIndex === i ? styles.themeBtnActive : ''}`}
                                    style={{
                                        backgroundColor: t.bg === 'white' ? '#fff' : t.bg,
                                    }}
                                    onClick={() => handleThemeChange(i)}
                                    title={t.name}
                                    aria-label={`主题：${t.name}`}
                                    aria-pressed={themeIndex === i}
                                />
                            ))}
                        </div>
                    </div>

                    <div className={styles.divider} />

                    {/* 2. 字号调整 */}
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
                </div>
            )}
        </div>
    );
}
