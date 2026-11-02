import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import Highlight from './Highlight';
import styles from './search.module.css';

const COLLAPSED = 5;

const paraHref = (url, p) => `${url}?hl=${p}-${p}#p${p}`;

/**
 * 关键词搜索的文章结果：分组名 / 篇名，命中段落（长段为以关键词为中心的片段），点击跳转到原文段落
 * @param {{ item: import('./api').ArticleItem, index: number }} props
 */
export default function ArticleCard({ item, index }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? item.hits : item.hits.slice(0, COLLAPSED);
    const remaining = item.hits.length - COLLAPSED;

    return (
        <article className={styles.searchCard}>
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleArea}>
                    <span className={styles.cardBadgeRow}>
                        <span className={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</span>
                        <span className={styles.seriesBadge}>{item.groupLabel}</span>
                    </span>
                    <Link to={paraHref(item.url, item.hits[0]?.p)} className={styles.cardTitleLink} title="跳转到第一处匹配">
                        <span className={styles.titleText}>{item.title}</span>
                    </Link>
                </div>
                <div className={styles.cardMetaArea}>
                    <span className={styles.matchCountBadge}>
                        <span className={styles.matchCountNumber}>{item.count}</span> 处匹配
                    </span>
                </div>
            </div>

            <div className={styles.subtitlesContainer}>
                {shown.map((h, i) => (
                    <React.Fragment key={`${h.p}-${i}`}>
                        {h.gap && <div className={styles.subtitleGap} />}
                        <Link to={paraHref(item.url, h.p)} className={`${styles.subtitleRow} ${styles.subtitleHit}`} title={`跳转到原文第 ${h.p} 段`}>
                            <span className={styles.timeTag}>¶{h.p}</span>
                            <span className={styles.subtitleContent}>
                                {h.head && '…'}
                                <Highlight text={h.text} ranges={h.hl} />
                                {h.tail && '…'}
                            </span>
                        </Link>
                    </React.Fragment>
                ))}

                {remaining > 0 && (
                    <div className={styles.expandArea}>
                        <button type="button" onClick={() => setExpanded(!expanded)} className={styles.expandBtn}>
                            <span>{expanded ? '收起其余段落' : `展开其余 ${remaining} 段`}</span>
                            <span className={styles.expandArrow}>{expanded ? '▴' : '▾'}</span>
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}
