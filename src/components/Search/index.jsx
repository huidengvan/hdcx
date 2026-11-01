import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import SearchBar from './SearchBar';
import SearchList, { validBooks } from './SearchList';
import AiFilter from './AiFilter';
import AiResultList from './AiResultList';
import { searchRequest } from './api';
import { ragSearch, ragCategories } from './ragApi';
import styles from './search.module.css';
import aiStyles from './ai.module.css';

const MODES = {
    subtitle: {
        label: '字幕搜索',
        icon: '🔍',
        title: '法语字幕搜索',
        subtitle: '检索慧灯禅修课视频字幕，点击时间跳转至相应视频时间',
    },
    ai: {
        label: 'AI 搜索',
        icon: '✨',
        title: 'AI 法本搜索',
        subtitle: '按语义检索课程法本、《慧灯之光》与课程视频字幕，可直接提问，点击跳转至原文段落或视频时间点',
        placeholder: '直接输入问题，如“皈依的目的是什么”（按 / 键快速聚焦）...',
        // 语义搜索擅长完整问句，示例均已实测能命中对应文章
        hotLabel: '可以这样问：',
        hotKeywords: ['出离心和世间善法有什么区别', '如何把病苦转为道用', '放生怎样才算大乘法', '皈依的目的是什么'],
    },
};

const validGroups = new Set(ragCategories.flatMap((c) => c.groups.map((g) => g.id)));

/**
 * 内部交互主组件（仅在客户端渲染，安全操作 window/URL）
 */
function SearchPageContent() {
    const [mode, setMode] = useState('subtitle');
    const [groups, setGroups] = useState([]);
    const [books, setBooks] = useState([]);
    const [keywords, setKeywords] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef(null);

    /**
     * 更新浏览器地址栏 URL（无刷新同步）
     */
    const updateUrl = useCallback((kw, page, nextMode, nextGroups, nextBooks) => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);

        if (kw) {
            url.searchParams.set('q', kw);
            if (url.searchParams.has('keyword')) {
                url.searchParams.delete('keyword');
            }
        } else {
            url.searchParams.delete('q');
            url.searchParams.delete('keyword');
        }

        if (page > 1 && nextMode !== 'ai') {
            url.searchParams.set('page', String(page));
        } else {
            url.searchParams.delete('page');
            url.searchParams.delete('p');
        }

        if (nextMode === 'ai') url.searchParams.set('mode', 'ai');
        else url.searchParams.delete('mode');

        if (nextMode === 'ai' && nextGroups.length) url.searchParams.set('g', nextGroups.join(','));
        else url.searchParams.delete('g');

        if (nextMode !== 'ai' && nextBooks.length) url.searchParams.set('b', nextBooks.join(','));
        else url.searchParams.delete('b');

        window.history.pushState({ q: kw, page }, '', url.toString());
    }, []);

    /**
     * 执行数据请求
     */
    const doSearch = useCallback(async (kw, page = 1, searchMode = 'subtitle', searchGroups = [], searchBooks = []) => {
        abortRef.current?.abort();
        const cleanKw = (kw || '').trim();
        if (!cleanKw) {
            setResult(null);
            setError('');
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError('');

        try {
            const data = searchMode === 'ai'
                ? await ragSearch(cleanKw, searchGroups, controller.signal)
                : await searchRequest(cleanKw, page, searchBooks, controller.signal);
            if (controller.signal.aborted) return;
            setResult(data);
        } catch (err) {
            if (controller.signal.aborted) return;
            console.error('搜索出错:', err);
            setError(err.message || '网络连接异常，请稍后重试');
            setResult(null);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    /**
     * 从当前浏览器 URL 中解析查询参数并执行搜索
     */
    const syncFromUrl = useCallback(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const urlKw = params.get('q') || params.get('keyword') || '';
        const urlPage = parseInt(params.get('page') || params.get('p') || '1', 10);
        const validPage = isNaN(urlPage) || urlPage < 1 ? 1 : urlPage;
        const urlMode = params.get('mode') === 'ai' ? 'ai' : 'subtitle';
        const urlGroups = (params.get('g') || '').split(',').filter((g) => validGroups.has(g));
        const urlBooks = (params.get('b') || '').split(',').filter((b) => validBooks.has(b));

        setKeywords(urlKw);
        setCurrentPage(validPage);
        setMode(urlMode);
        setGroups(urlGroups);
        setBooks(urlBooks);
        setResult(null);

        if (urlKw) {
            doSearch(urlKw, validPage, urlMode, urlGroups, urlBooks);
        } else {
            setError('');
        }
    }, [doSearch]);

    // 初始化时从 URL 解析
    useEffect(() => {
        syncFromUrl();

        // 监听浏览器前进/后退事件
        const handlePopState = () => {
            syncFromUrl();
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [syncFromUrl]);

    /**
     * 用户提交搜索
     */
    const handleSearchSubmit = (newKw) => {
        const trimmed = newKw.trim();
        setKeywords(trimmed);
        setCurrentPage(1);
        updateUrl(trimmed, 1, mode, groups, books);
        doSearch(trimmed, 1, mode, groups, books);
    };

    /**
     * 切换字幕搜索 / AI 搜索，保留关键词并重新搜索
     */
    const handleModeChange = (nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setResult(null);
        setCurrentPage(1);
        updateUrl(keywords, 1, nextMode, groups, books);
        doSearch(keywords, 1, nextMode, groups, books);
    };

    /**
     * AI 搜索范围变更
     */
    const handleGroupsChange = (nextGroups) => {
        setGroups(nextGroups);
        updateUrl(keywords, 1, mode, nextGroups, books);
        doSearch(keywords, 1, mode, nextGroups, books);
    };

    /**
     * 字幕搜索按册筛选，回到第一页
     */
    const handleBooksChange = (nextBooks) => {
        setBooks(nextBooks);
        setCurrentPage(1);
        updateUrl(keywords, 1, mode, groups, nextBooks);
        doSearch(keywords, 1, mode, groups, nextBooks);
    };

    /**
     * 用户切换分页
     */
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        updateUrl(keywords, newPage, mode, groups, books);
        doSearch(keywords, newPage, mode, groups, books);
    };

    /**
     * 错误重试
     */
    const handleRetry = () => {
        doSearch(keywords, currentPage, mode, groups, books);
    };

    const modeInfo = MODES[mode];

    return (
        <div className={styles.searchContainer}>
            {/* 页面头部 */}
            <header className={styles.pageHeader}>
                <div className={aiStyles.modeSwitch} role="tablist" aria-label="搜索方式">
                    {Object.entries(MODES).map(([key, m]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={mode === key}
                            className={`${aiStyles.modeBtn} ${mode === key ? aiStyles.modeBtnActive : ''}`}
                            onClick={() => handleModeChange(key)}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
                <h1 className={styles.pageTitle}>
                    <span className={styles.titleIcon}>{modeInfo.icon}</span>
                    <span>{modeInfo.title}</span>
                </h1>
                <p className={styles.pageSubtitle}>{modeInfo.subtitle}</p>
            </header>

            {/* 搜索框 */}
            <SearchBar
                initialValue={keywords}
                onSearch={handleSearchSubmit}
                loading={loading}
                {...(mode === 'ai' ? { placeholder: modeInfo.placeholder, hotKeywords: modeInfo.hotKeywords, hotLabel: modeInfo.hotLabel } : {})}
            />

            {mode === 'ai' && <AiFilter selected={groups} onChange={handleGroupsChange} />}

            {/* 搜索结果 / 引导 / 空状态 */}
            {mode === 'ai' ? (
                <AiResultList
                    keywords={keywords}
                    result={result}
                    loading={loading}
                    error={error}
                    onRetry={handleRetry}
                    onSelectKeyword={handleSearchSubmit}
                />
            ) : (
                <SearchList
                    keywords={keywords}
                    result={result}
                    loading={loading}
                    error={error}
                    books={books}
                    onBooksChange={handleBooksChange}
                    onPageChange={handlePageChange}
                    onRetry={handleRetry}
                    onSelectKeyword={handleSearchSubmit}
                    onSwitchToAi={() => handleModeChange('ai')}
                />
            )}
        </div>
    );
}

/**
 * 导出页面（供 Docusaurus 路由使用，对应路径 /search）
 */
export default function SearchPage() {
    return (
        <Layout
            title="搜索 - 慧灯禅修课"
            description="检索慧灯禅修课视频字幕与课程法本，支持 AI 语义搜索，秒级跳转至音视频或原文段落"
        >
            <main className={styles.searchPageWrapper}>
                <BrowserOnly fallback={
                    <div className={styles.searchContainer}>
                        <header className={styles.pageHeader}>
                            <h1 className={styles.pageTitle}>🔍 搜索</h1>
                            <p className={styles.pageSubtitle}>正在加载搜索模块...</p>
                        </header>
                    </div>
                }>
                    {() => <SearchPageContent />}
                </BrowserOnly>
            </main>
        </Layout>
    );
}
