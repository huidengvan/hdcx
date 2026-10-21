import React from 'react';
import SearchCard from './SearchCard';
import Pagination from './Pagination';
import Skeleton from './Skeleton';
import styles from './search.module.css';

/**
 * 搜索结果展示容器
 * @param {{
 *   keywords: string,
 *   result?: {
 *     total: number,
 *     pageSize: number,
 *     page: number,
 *     data: any[]
 *   },
 *   loading: boolean,
 *   error?: string,
 *   onPageChange: (p: number) => void,
 *   onRetry: () => void,
 *   onSelectKeyword: (kw: string) => void
 * }} props
 */
export default function SearchList({
    keywords,
    result,
    loading,
    error,
    onPageChange,
    onRetry,
    onSelectKeyword
}) {
    // 加载中状态
    if (loading) {
        return (
            <div className={styles.resultsArea}>
                <div className={styles.loadingHint}>
                    <span className={styles.spinnerIcon}></span>
                    <span>正在检索法语字幕...</span>
                </div>
                <Skeleton />
            </div>
        );
    }

    // 错误状态
    if (error) {
        return (
            <div className={styles.stateContainer}>
                <div className={styles.errorCard}>
                    <div className={styles.stateIcon}>⚠️</div>
                    <h3 className={styles.stateTitle}>搜索服务暂不可用</h3>
                    <p className={styles.stateDesc}>{error}</p>
                    <button type="button" onClick={onRetry} className={styles.retryBtn}>
                        重试一下
                    </button>
                </div>
            </div>
        );
    }

    // 未输入关键词时的欢迎引导界面
    if (!keywords) {
        return (
            <div className={styles.introContainer}>
                <div className={styles.introGrid}>
                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>🎯</div>
                        <h4 className={styles.introTitle}>秒级定位</h4>
                        <p className={styles.introText}>
                            点击搜索结果中的字幕时间标签，可立即跳转到对应视频的精确时间点开始播放。
                        </p>
                    </div>

                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>⚡</div>
                        <h4 className={styles.introTitle}>多词检索</h4>
                        <p className={styles.introText}>
                            输入多个词语并用空格分隔（如 <code>菩提心 慈悲心</code>），快速筛选包含所有词汇的段落。
                        </p>
                    </div>

                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>📚</div>
                        <h4 className={styles.introTitle}>全卷覆盖</h4>
                        <p className={styles.introText}>
                            全面覆盖慧灯禅修课第一册至第四册等高清视频开示与原文字幕内容。
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // 无搜索结果
    if (!result || result.total === 0 || !result.data || result.data.length === 0) {
        return (
            <div className={styles.stateContainer}>
                <div className={styles.emptyCard}>
                    <div className={styles.stateIcon}>🍃</div>
                    <h3 className={styles.stateTitle}>未找到与 “{keywords}” 相关的视频字幕</h3>
                    <div className={styles.emptyTips}>
                        <p>建议尝试：</p>
                        <ul>
                            <li>检查是否有错别字或繁简字差异</li>
                            <li>尝试使用更通用、精炼的佛学词汇（如将句子缩减为关键词）</li>
                            <li>若使用了多个词，尝试去掉部分词以放宽搜索条件</li>
                        </ul>
                    </div>
                    <div className={styles.quickTags}>
                        <span className={styles.quickTagLabel}>试试搜索热门词：</span>
                        {['菩提心', '出离心', '空性', '四加行'].map((tag) => (
                            <button
                                key={tag}
                                type="button"
                                className={styles.quickTagBtn}
                                onClick={() => onSelectKeyword(tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // 计算当前页匹配总行数
    const totalMatchesOnPage = result.data.reduce((acc, item) => acc + (item.count || 0), 0);

    return (
        <div className={styles.resultsArea}>
            {/* 统计横幅 */}
            <div className={styles.resultsMetaBar}>
                <div className={styles.resultsCount}>
                    共找到 <strong className={styles.highlightNumber}>{result.total}</strong> 个相关视频
                    <span className={styles.resultsSubCount}>
                        （当前页包含 <strong>{totalMatchesOnPage}</strong> 处字幕匹配）
                    </span>
                </div>
                <div className={styles.pageInfo}>
                    第 <strong>{result.page}</strong> / {Math.ceil(result.total / result.pageSize)} 页
                </div>
            </div>

            {/* 结果列表 */}
            <div className={styles.cardList}>
                {result.data.map((item, index) => (
                    <SearchCard
                        key={`${item.series}-${item.title}-${index}`}
                        title={item.title}
                        series={item.series}
                        count={item.count}
                        subtitles={item.subtitles}
                        searchKeyword={keywords}
                    />
                ))}
            </div>

            {/* 分页控制 */}
            <Pagination
                total={result.total}
                pageSize={result.pageSize}
                page={result.page}
                onChange={onPageChange}
            />
        </div>
    );
}
