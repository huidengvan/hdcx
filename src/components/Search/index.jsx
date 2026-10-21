import React, { useState, useEffect, useCallback } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import SearchBar from './SearchBar';
import SearchList from './SearchList';
import { searchRequest } from './api';
import styles from './search.module.css';

/**
 * 内部交互主组件（仅在客户端渲染，安全操作 window/URL）
 */
function SearchPageContent() {
    const [keywords, setKeywords] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    /**
     * 更新浏览器地址栏 URL（无刷新同步）
     */
    const updateUrl = useCallback((kw, page) => {
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

        if (page > 1) {
            url.searchParams.set('page', String(page));
        } else {
            url.searchParams.delete('page');
            url.searchParams.delete('p');
        }

        window.history.pushState({ q: kw, page }, '', url.toString());
    }, []);

    /**
     * 执行数据请求
     */
    const doSearch = useCallback(async (kw, page = 1) => {
        const cleanKw = (kw || '').trim();
        if (!cleanKw) {
            setResult(null);
            setError('');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const data = await searchRequest(cleanKw, page);
            setResult(data);
        } catch (err) {
            console.error('搜索出错:', err);
            setError(err.message || '网络连接异常，请稍后重试');
            setResult(null);
        } finally {
            setLoading(false);
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

        setKeywords(urlKw);
        setCurrentPage(validPage);

        if (urlKw) {
            doSearch(urlKw, validPage);
        } else {
            setResult(null);
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
        updateUrl(trimmed, 1);
        doSearch(trimmed, 1);
    };

    /**
     * 用户切换分页
     */
    const handlePageChange = (newPage) => {
        setCurrentPage(newPage);
        updateUrl(keywords, newPage);
        doSearch(keywords, newPage);
    };

    /**
     * 错误重试
     */
    const handleRetry = () => {
        doSearch(keywords, currentPage);
    };

    return (
        <div className={styles.searchContainer}>
            {/* 页面头部 */}
            <header className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>
                    <span className={styles.titleIcon}>🔍</span>
                    <span>法语字幕搜索</span>
                </h1>
                <p className={styles.pageSubtitle}>
                    检索慧灯禅修课音视频字幕，点击时间跳转至相应音视频片段播放
                </p>
            </header>

            {/* 搜索框 */}
            <SearchBar
                initialValue={keywords}
                onSearch={handleSearchSubmit}
                loading={loading}
            />

            {/* 搜索结果 / 引导 / 空状态 */}
            <SearchList
                keywords={keywords}
                result={result}
                loading={loading}
                error={error}
                onPageChange={handlePageChange}
                onRetry={handleRetry}
                onSelectKeyword={handleSearchSubmit}
            />
        </div>
    );
}

/**
 * 导出页面（供 Docusaurus 路由使用，对应路径 /search）
 */
export default function SearchPage() {
    return (
        <Layout
            title="法语搜索 - 慧灯禅修课"
            description="检索慧灯禅修课视频字幕与法音开示，秒级跳转至音视频播放"
        >
            <main className={styles.searchPageWrapper}>
                <BrowserOnly fallback={
                    <div className={styles.searchContainer}>
                        <header className={styles.pageHeader}>
                            <h1 className={styles.pageTitle}>🔍 法语字幕搜索</h1>
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
