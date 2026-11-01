import React, { useState, useMemo } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Highlight from './Highlight';
import { formatDisplayTime, buildVideoUrl } from './api';
import styles from './search.module.css';

/**
 * @param {{
 *   title: string,
 *   series: string,
 *   count: number,
 *   subtitles: string,
 *   searchKeyword: string,
 *   index?: number,
 *   countLabel?: string,
 *   itemLabel?: string,
 *   collapsedCount?: number
 * }} props
 * 字幕项可带 hit（关键行，加底色）/ ctx（上下文行，淡色）/ gap（与上一组之间加分隔），供 AI 搜索复用
 * collapsedCount：收起时显示的行数
 */
export default function SearchCard({ title, series, count, subtitles, searchKeyword, index, countLabel = '处匹配', itemLabel = '条匹配字幕', collapsedCount = 8 }) {
    const [expanded, setExpanded] = useState(false);
    const videoBasePath = useBaseUrl('/video');

    const subtitleList = useMemo(() => {
        if (!subtitles || typeof subtitles !== 'string' || subtitles === 'undefined' || subtitles === 'null') {
            return [];
        }
        try {
            const parsed = JSON.parse(subtitles);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }, [subtitles]);

    const displayedSubtitles = expanded ? subtitleList : subtitleList.slice(0, collapsedCount);
    const remainingCount = subtitleList.length - collapsedCount;
    const videoUrl = buildVideoUrl(series, title, null, videoBasePath);

    return (
        <article className={styles.searchCard}>
            {/* 卡片头部 */}
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleArea}>
                    {series && (
                        <span className={styles.cardBadgeRow}>
                            {index !== undefined && <span className={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</span>}
                            <span className={styles.seriesBadge} title={`所属系列: ${series}`}>
                                {series}
                            </span>
                        </span>
                    )}
                    <a
                        href={videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.cardTitleLink}
                        title="点击在新窗口打开此视频"
                    >
                        <span className={styles.videoIcon}>🎥</span>
                        <span className={styles.titleText}>{title}</span>
                    </a>
                </div>

                <div className={styles.cardMetaArea}>
                    <span className={styles.matchCountBadge}>
                        <span className={styles.matchCountNumber}>{count}</span> {countLabel}
                    </span>
                    <a
                        href={videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.playVideoBtn}
                        title="打开完整视频"
                    >
                        <span>播放完整视频</span>
                        <svg className={styles.externalIcon} viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                            <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
                            <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
                        </svg>
                    </a>
                </div>
            </div>

            {/* 字幕内容列表 */}
            <div className={styles.subtitlesContainer}>
                {displayedSubtitles.map((sub, i) => {
                    const subUrl = buildVideoUrl(series, title, sub.startTime, videoBasePath);
                    const displayTime = formatDisplayTime(sub.startTime);

                    return (
                        <React.Fragment key={`${sub.lineId}-${i}`}>
                        {sub.gap && <div className={styles.subtitleGap} />}
                        <a
                            href={subUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${styles.subtitleRow} ${sub.hit ? styles.subtitleHit : ''} ${sub.ctx ? styles.subtitleCtx : ''}`}
                            title={`第 ${sub.lineId} 行，点击跳转至 ${displayTime} 开始播放`}
                        >
                            <span className={styles.timeTag}>{displayTime}</span>
                            <span className={styles.subtitleContent}>
                                <Highlight search={searchKeyword} text={sub.text} />
                            </span>
                        </a>
                        </React.Fragment>
                    );
                })}

                {/* 展开/收起按钮 */}
                {remainingCount > 0 && (
                    <div className={styles.expandArea}>
                        <button
                            type="button"
                            onClick={() => setExpanded(!expanded)}
                            className={styles.expandBtn}
                        >
                            {expanded ? (
                                <>
                                    <span>收起其余字幕</span>
                                    <span className={styles.expandArrow}>▴</span>
                                </>
                            ) : (
                                <>
                                    <span>展开其余 {remainingCount} {itemLabel}</span>
                                    <span className={styles.expandArrow}>▾</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}
