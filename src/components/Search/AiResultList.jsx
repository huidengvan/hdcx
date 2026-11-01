import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import toast from 'react-hot-toast';
import Skeleton from './Skeleton';
import { matchedTerms, splitSentences, buildSnippet, relevanceLevel } from './ragApi';
import styles from './search.module.css';
import aiStyles from './ai.module.css';

const VISIBLE_HITS = 3;

function RelevanceBar({ score, ranker }) {
    const level = relevanceLevel(score, ranker);
    return (
        <span className={aiStyles.relevance} title={`相关度 ${level}/5`} aria-label={`相关度 ${level}/5`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`${aiStyles.relevanceDot} ${i <= level ? aiStyles.relevanceDotOn : ''}`} />
            ))}
        </span>
    );
}

// 展开 / 收起图标：宽角圆头折线（参照 Lucide chevron-down 加宽），展开后旋转朝上
function Chevron({ up }) {
    return (
        <svg
            className={`${aiStyles.chevron} ${up ? aiStyles.chevronUp : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5 9l7 6 7-6" />
        </svg>
    );
}

// 含查询关键词的句子以底色标出
function Sentences({ sentences }) {
    return sentences.map((s, i) =>
        s.hit ? (
            <mark key={i} className={aiStyles.sentenceMark}>
                {s.text}
            </mark>
        ) : (
            <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
    );
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // 非安全上下文（如局域网 http 访问）回退到 execCommand
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
    }
}

/**
 * 单个命中段落：折叠时显示以关键句为中心的摘要，展开显示完整段落；可复制引用、跳转原文
 */
function HitBlock({ doc, hit, query }) {
    const { siteConfig } = useDocusaurusContext();
    const [expanded, setExpanded] = useState(false);
    const paragraphs = useMemo(() => splitSentences(hit.text, matchedTerms(query, hit.text)), [hit.text, query]);
    const snippet = useMemo(() => buildSnippet(paragraphs), [paragraphs]);
    const truncated = snippet.head || snippet.tail || paragraphs.length > 1;

    const handleCopy = async () => {
        const range = hit.pEnd > hit.pStart ? `第 ${hit.pStart}～${hit.pEnd} 段` : `第 ${hit.pStart} 段`;
        const source = `——${doc.groupLabel}《${doc.title}》${hit.section ? ` ${hit.section}` : ''}（${range}）`;
        const url = `${siteConfig.url}${doc.url}#p${hit.pStart}`;
        await copyText(`${hit.text}\n${source}\n${url}`);
        toast.success('已复制引用');
    };

    return (
        <div className={aiStyles.hitBlock}>
            {hit.section && <div className={aiStyles.hitSection}>{hit.section}</div>}

            <div className={aiStyles.hitText}>
                {expanded ? (
                    paragraphs.map((sentences, i) => (
                        <p key={i} className={aiStyles.hitPara}>
                            <Sentences sentences={sentences} />
                        </p>
                    ))
                ) : (
                    <p className={aiStyles.hitPara}>
                        {snippet.head && <span className={aiStyles.ellipsis}>… </span>}
                        <Sentences sentences={snippet.sentences} />
                        {snippet.tail && <span className={aiStyles.ellipsis}> …</span>}
                    </p>
                )}
            </div>

            {/* 三栏：左留空 / 中间展开 / 右侧复制引用与跳转原文，保证展开按钮居中 */}
            <div className={aiStyles.hitActions}>
                <span />
                {truncated ? (
                    <button type="button" className={aiStyles.actionBtn} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
                        {expanded ? '收起' : '展开'}
                        <Chevron up={expanded} />
                    </button>
                ) : (
                    <span />
                )}
                <div className={aiStyles.hitActionsRight}>
                    <button type="button" className={aiStyles.actionBtn} onClick={handleCopy} title="复制引用" aria-label="复制引用">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                            <rect x="5" y="5" width="9" height="9" rx="2" />
                            <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                        </svg>
                        <span className={aiStyles.copyLabel}>复制引用</span>
                    </button>
                    <Link to={hit.href} className={aiStyles.jumpBtn} title={`跳转到原文第 ${hit.pStart} 段`}>
                        跳转原文
                    </Link>
                </div>
            </div>
        </div>
    );
}

/**
 * 单篇文章的结果卡片：序号 + 册 / 篇名，命中段落按相关度降序
 * @param {{ doc: import('./ragApi').RagDoc, index: number, query: string, ranker: string }} props
 */
function AiResultCard({ doc, index, query, ranker }) {
    const [showAll, setShowAll] = useState(false);
    const hits = showAll ? doc.hits : doc.hits.slice(0, VISIBLE_HITS);
    const remaining = doc.hits.length - VISIBLE_HITS;

    return (
        <article className={`${styles.searchCard} ${aiStyles.aiCard}`}>
            <div className={aiStyles.cardHead}>
                <span className={aiStyles.resultIndex}>{String(index + 1).padStart(2, '0')}</span>
                <div className={aiStyles.crumb}>
                    <span className={aiStyles.crumbGroup}>{doc.groupLabel}</span>
                    <span className={aiStyles.crumbSep}>/</span>
                    <Link to={doc.hits[0].href} className={aiStyles.crumbTitle} title="跳转到最相关的段落">
                        {doc.title}
                    </Link>
                </div>
                <div className={aiStyles.cardMeta}>
                    {doc.hits.length > 1 && <span className={aiStyles.hitCount}>{doc.hits.length} 处</span>}
                    <RelevanceBar score={doc.score} ranker={ranker} />
                </div>
            </div>

            <div className={aiStyles.hitList}>
                {hits.map((hit) => (
                    <HitBlock key={hit.pStart} doc={doc} hit={hit} query={query} />
                ))}
            </div>

            {remaining > 0 && (
                <div className={styles.expandArea}>
                    <button type="button" onClick={() => setShowAll(!showAll)} className={styles.expandBtn}>
                        <span>{showAll ? '收起' : `查看本篇其余 ${remaining} 处`}</span>
                        <Chevron up={showAll} />
                    </button>
                </div>
            )}
        </article>
    );
}

/**
 * AI 搜索结果容器
 * @param {{
 *   keywords: string,
 *   result?: { tookMs: number, ranker: string, results: import('./ragApi').RagDoc[] },
 *   loading: boolean,
 *   error?: string,
 *   onRetry: () => void,
 *   onSelectKeyword: (kw: string) => void
 * }} props
 */
export default function AiResultList({ keywords, result, loading, error, onRetry, onSelectKeyword }) {
    if (loading) {
        return (
            <div className={styles.resultsArea}>
                <div className={styles.loadingHint}>
                    <span className={styles.spinnerIcon}></span>
                    <span>正在语义检索法本...</span>
                </div>
                <Skeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.stateContainer}>
                <div className={styles.errorCard}>
                    <div className={styles.stateIcon}>⚠️</div>
                    <h3 className={styles.stateTitle}>AI 搜索暂不可用</h3>
                    <p className={styles.stateDesc}>{error}，也可切换到字幕搜索。</p>
                    <button type="button" onClick={onRetry} className={styles.retryBtn}>
                        重试一下
                    </button>
                </div>
            </div>
        );
    }

    if (!keywords) {
        return (
            <div className={styles.introContainer}>
                <div className={styles.introGrid}>
                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>💬</div>
                        <h4 className={styles.introTitle}>用问题来搜</h4>
                        <p className={styles.introText}>
                            按意思而非字面检索，可直接输入问题，如 <code>皈依的目的是什么</code>。
                        </p>
                    </div>
                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>🎯</div>
                        <h4 className={styles.introTitle}>段落定位</h4>
                        <p className={styles.introText}>可展开查看相关段落、复制引用，或跳转到原文对应段落并高亮显示。</p>
                    </div>
                    <div className={styles.introCard}>
                        <div className={styles.introIcon}>📚</div>
                        <h4 className={styles.introTitle}>按册筛选</h4>
                        <p className={styles.introText}>可限定在某几册中搜索，不选则搜索全部法本。</p>
                    </div>
                </div>
            </div>
        );
    }

    const docs = result?.results || [];
    if (!docs.length) {
        return (
            <div className={styles.stateContainer}>
                <div className={styles.emptyCard}>
                    <div className={styles.stateIcon}>🍃</div>
                    <h3 className={styles.stateTitle}>未找到与 “{keywords}” 足够相关的内容</h3>
                    <div className={styles.emptyTips}>
                        <p>建议尝试：</p>
                        <ul>
                            <li>换一种问法，或把问题说得更具体些</li>
                            <li>放宽筛选范围，选择「全部」</li>
                            <li>查找某个原词出现的位置，可切换到字幕搜索</li>
                        </ul>
                    </div>
                    <div className={styles.quickTags}>
                        <span className={styles.quickTagLabel}>试试：</span>
                        {['皈依的目的是什么', '如何修四无量心', '怎样忏悔罪业'].map((tag) => (
                            <button key={tag} type="button" className={styles.quickTagBtn} onClick={() => onSelectKeyword(tag)}>
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const totalHits = docs.reduce((n, d) => n + d.hits.length, 0);

    return (
        <div className={styles.resultsArea}>
            <div className={styles.resultsMetaBar}>
                <div className={styles.resultsCount}>
                    找到 <strong className={styles.highlightNumber}>{docs.length}</strong> 篇相关文章
                    <span className={styles.resultsSubCount}>
                        （共 <strong>{totalHits}</strong> 处）
                    </span>
                </div>
            </div>
            <div className={styles.cardList}>
                {docs.map((doc, i) => (
                    <AiResultCard key={doc.doc} doc={doc} index={i} query={keywords} ranker={result.ranker} />
                ))}
            </div>
        </div>
    );
}
