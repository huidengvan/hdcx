import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import SearchBar from './SearchBar';
import SearchList, { validCats } from './SearchList';
import AiFilter from './AiFilter';
import AiResultList from './AiResultList';
import { searchRequest } from './api';
import { ragSearch, ragCategories } from './ragApi';
import styles from './search.module.css';
import aiStyles from './ai.module.css';

const MODES = {
    subtitle: {
        label: '关键词搜索',
        icon: '🔍',
        title: '关键词搜索',
        subtitle: '按字面检索课程视频字幕、《慧灯之光》与参考资料，点击跳转至视频时间点或原文段落',
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
    const [cats, setCats] = useState([]);
    const [keywords, setKeywords] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef(null);

    /**
     * 更新浏览器地址栏 URL（无刷新同步）
     */
    const updateUrl = useCallback((kw, page, nextMode, nextGroups, nextCats) => {
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

        if (nextMode !== 'ai' && nextCats.length) url.searchParams.set('c', nextCats.join(','));
        else url.searchParams.delete('c');

        window.history.pushState({ q: kw, page }, '', url.toString());
    }, []);

    /**
     * 执行数据请求
     */
    const doSearch = useCallback(async (kw, page = 1, searchMode = 'subtitle', searchGroups = [], searchCats = []) => {
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
                : await searchRequest(cleanKw, page, searchCats, controller.signal);
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
        const urlCats = (params.get('c') || '').split(',').filter((c) => validCats.has(c));

        setKeywords(urlKw);
        setCurrentPage(validPage);
        setMode(urlMode);
        setGroups(urlGroups);
        setCats(urlCats);
        setResult(null);

        if (urlKw) {
            doSearch(urlKw, validPage, urlMode, urlGroups, urlCats);
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
        updateUrl(trimmed, 1, mode, groups, cats);
        doSearch(trimmed, 1, mode, groups, cats);
    };

    /**
     * 切换关键词搜索 / AI 搜索，保留关键词并重新搜索
     */
    const handleModeChange = (nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setResult(null);
        setCurrentPage(1);
        updateUrl(keywords, 1, nextMode, groups, cats);
        doSearch(keywords, 1, nextMode, groups, cats);
    };

    /**
     * AI 搜索范围变更
     */
    const handleGroupsChange = (nextGroups) => {
        setGroups(nextGroups);
        updateUrl(keywords, 1, mode, nextGroups, cats);
        doSearch(keywords, 1, mode, nextGroups, cats);
    };

    /**
     * 关键词搜索按分类筛选，回到第一页
     */
    const handleCatsChange = (nextCats) => {
        setCats(nextCats);
        setCurrentPage(1);
        updateUrl(keywords, 1, mode, groups, nextCats);
        doSearch(keywords, 1, mode, groups, nextCats);
    };

    /**
     * 用户切换分页
     */
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        updateUrl(keywords, newPage, mode, groups, cats);
        doSearch(keywords, newPage, mode, groups, cats);
    };

    /**
     * 错误重试
     */
    const handleRetry = () => {
        doSearch(keywords, currentPage, mode, groups, cats);
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
                    cats={cats}
                    onCatsChange={handleCatsChange}
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
            description="按关键词检索慧灯禅修课视频字幕、《慧灯之光》与参考资料，支持 AI 语义搜索，跳转至视频时间点或原文段落"
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
