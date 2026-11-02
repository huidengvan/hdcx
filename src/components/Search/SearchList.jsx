import React from 'react';
import SearchCard from './SearchCard';
import ArticleCard from './ArticleCard';
import Pagination from './Pagination';
import Skeleton from './Skeleton';
import styles from './search.module.css';
import aiStyles from './ai.module.css';

// 关键词搜索的分类，与 workers/fayu-api 导入的 docs.cat 一致
const CATS = [
    { id: 'video', label: '课程视频' },
    { id: 'hdzg', label: '慧灯之光' },
    { id: 'misc', label: '其他参考' },
    { id: 'refs', label: '参考资料' },
];

export const validCats = new Set(CATS.map((c) => c.id));

/**
 * 按分类筛选（多选），显示各分类匹配的篇数；未选任何分类表示全部，没有匹配的分类不显示
 * @param {{ facets: Record<string, number>, selected: string[], onChange: (cats: string[]) => void }} props
 */
function CategoryFilter({ facets, selected, onChange }) {
    const total = Object.values(facets).reduce((n, c) => n + c, 0);
    const toggle = (id) => onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
    return (
        <div className={aiStyles.filterBar}>
            <div className={aiStyles.filterGroup}>
                <button
                    type="button"
                    className={`${aiStyles.filterChip} ${selected.length === 0 ? aiStyles.filterChipActive : ''}`}
                    onClick={() => onChange([])}
                >
                    全部 {total}
                </button>
                {CATS.filter(({ id }) => facets[id] || selected.includes(id)).map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        className={`${aiStyles.filterChip} ${selected.includes(id) ? aiStyles.filterChipActive : ''}`}
                        onClick={() => toggle(id)}
                        aria-pressed={selected.includes(id)}
                    >
                        {label} {facets[id] || 0}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * 搜索结果展示容器
 * @param {{
 *   keywords: string,
 *   result?: import('./api').SearchResult,
 *   loading: boolean,
 *   error?: string,
 *   cats: string[],
 *   onCatsChange: (cats: string[]) => void,
 *   onPageChange: (p: number) => void,
 *   onRetry: () => void,
 *   onSelectKeyword: (kw: string) => void,
 *   onSwitchToAi: () => void
 * }} props
 */
export default function SearchList({
    keywords,
    result,
    loading,
    error,
    cats,
    onCatsChange,
    onPageChange,
    onRetry,
    onSelectKeyword,
    onSwitchToAi
}) {
    // 加载中状态
    if (loading) {
        return (
            <div className={styles.resultsArea}>
                <div className={styles.loadingHint}>
                    <span className={styles.spinnerIcon}></span>
                    <span>正在检索...</span>
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
                        <h4 className={styles.introTitle}>精确定位</h4>
                        <p className={styles.introText}>
                            点击视频字幕可跳转到对应时间点播放，点击文章段落可跳转到原文并高亮该段。
                        </p>
                    </div>

                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>⚡</div>
                        <h4 className={styles.introTitle}>多词检索</h4>
                        <p className={styles.introText}>
                            输入多个词语并用空格分隔（如 <code>菩提心 慈悲心</code>），查找都包含这些词的视频与文章，优先显示同时出现之处；繁体、空格不影响匹配。
                        </p>
                    </div>

                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>📚</div>
                        <h4 className={styles.introTitle}>分类筛选</h4>
                        <p className={styles.introText}>
                            涵盖慧灯禅修课第一～四册视频字幕、《慧灯之光》1～12 册、其他参考与参考资料，可按分类筛选。
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // 关键词过长：关键词搜索按字面匹配，长句应提炼为关键词或改用 AI 搜索
    if (result?.tooLong) {
        return (
            <div className={styles.stateContainer}>
                <div className={styles.emptyCard}>
                    <div className={styles.stateIcon}>✂️</div>
                    <h3 className={styles.stateTitle}>关键词太长了</h3>
                    <div className={styles.emptyTips}>
                        <p>关键词搜索按字面匹配，最多 50 字：</p>
                        <ul>
                            <li>请提炼为几个关键词，用空格分隔（如 <code>人身难得 暇满</code>）</li>
                            <li>想用一句话提问，可以改用 AI 搜索，按意思查找相关的字幕和法本</li>
                        </ul>
                    </div>
                    <button type="button" onClick={onSwitchToAi} className={styles.retryBtn}>
                        改用 AI 搜索
                    </button>
                </div>
            </div>
        );
    }

    // 有匹配时才显示筛选；选了分类但该分类无结果时仍显示，便于切回
    const facets = result?.facets || {};
    const filter = Object.keys(facets).length > 0 && <CategoryFilter facets={facets} selected={cats} onChange={onCatsChange} />;

    // 无搜索结果
    if (!result || result.total === 0 || !result.data || result.data.length === 0) {
        return (
            <>
            {filter}
            <div className={styles.stateContainer}>
                <div className={styles.emptyCard}>
                    <div className={styles.stateIcon}>🍃</div>
                    <h3 className={styles.stateTitle}>未找到包含 “{keywords}” 的内容</h3>
                    <div className={styles.emptyTips}>
                        <p>建议尝试：</p>
                        <ul>
                            <li>检查是否有错别字或同音字</li>
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
            </>
        );
    }

    return (
        <>
        {filter}
        <div className={styles.resultsArea}>
            {/* 统计横幅 */}
            <div className={styles.resultsMetaBar}>
                <div className={styles.resultsCount}>
                    共找到 <strong className={styles.highlightNumber}>{result.total}</strong> 个视频 / 文章
                    <span className={styles.resultsSubCount}>
                        （共 <strong>{result.matches}</strong> 处匹配）
                    </span>
                </div>
                <div className={styles.pageInfo}>
                    第 <strong>{result.page}</strong> / {Math.ceil(result.total / result.pageSize)} 页
                </div>
            </div>

            {/* 结果列表 */}
            <div className={styles.cardList}>
                {result.data.map((item, i) => {
                    const index = (result.page - 1) * result.pageSize + i;
                    return item.type === 'article' ? (
                        <ArticleCard key={`${item.url}-${item.title}`} item={item} index={index} />
                    ) : (
                        <SearchCard
                            key={`${item.series}-${item.title}`}
                            title={item.title}
                            series={item.series}
                            count={item.count}
                            subtitles={item.subtitles}
                            searchKeyword={result.terms?.join(' ') || keywords}
                            index={index}
                        />
                    );
                })}
            </div>

            {/* 分页控制 */}
            <Pagination
                total={result.total}
                pageSize={result.pageSize}
                page={result.page}
                onChange={onPageChange}
            />
        </div>
        </>
    );
}
