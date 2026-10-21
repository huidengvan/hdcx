import React from 'react';
import styles from './search.module.css';

/**
 * 转义正则特殊字符
 * @param {string} str 
 * @returns {string}
 */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 关键词高亮组件
 * @param {{ search?: string, text: string }} props 
 */
export default function Highlight({ search, text }) {
    if (!search || !text) {
        return <span>{text}</span>;
    }

    // 将搜索词按空格分词，过滤空项并去重
    const terms = Array.from(
        new Set(
            search
                .trim()
                .split(/\s+/)
                .filter(term => term.length > 0)
        )
    );

    if (terms.length === 0) {
        return <span>{text}</span>;
    }

    try {
        const pattern = terms.map(escapeRegExp).join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');
        const parts = text.split(regex);
        const lowerTerms = new Set(terms.map(t => t.toLowerCase()));

        return (
            <span className={styles.highlightWrapper}>
                {parts.map((part, index) => {
                    const isMatch = lowerTerms.has(part.toLowerCase());
                    return isMatch ? (
                        <mark key={index} className={styles.highlightMark}>
                            {part}
                        </mark>
                    ) : (
                        part
                    );
                })}
            </span>
        );
    } catch (err) {
        // 兜底降级为纯文本
        return <span>{text}</span>;
    }
}
