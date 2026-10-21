import React, { useState, useEffect, useRef } from 'react';
import styles from './search.module.css';

const HOT_KEYWORDS = [
    '菩提心',
    '出离心',
    '空性',
    '四加行',
    '五加行',
    '慈悲心',
    '人身难得',
    '因果不虚',
];

/**
 * 搜索输入栏组件
 * @param {{
 *   initialValue: string,
 *   onSearch: (value: string) => void,
 *   loading?: boolean
 * }} props
 */
export default function SearchBar({ initialValue = '', onSearch, loading = false }) {
    const [inputValue, setInputValue] = useState(initialValue);
    const inputRef = useRef(null);

    // 当外部 initialValue 变更时同步
    useEffect(() => {
        setInputValue(initialValue);
    }, [initialValue]);

    // 快捷键支持：按 '/' 聚焦搜索框
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === '/' && document.activeElement !== inputRef.current) {
                const isFormInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
                if (!isFormInput) {
                    e.preventDefault();
                    inputRef.current?.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleSubmit = (e) => {
        e?.preventDefault();
        const trimmed = inputValue.trim();
        if (trimmed) {
            onSearch(trimmed);
        }
    };

    const handleClear = () => {
        setInputValue('');
        inputRef.current?.focus();
    };

    const handleTagClick = (tag) => {
        setInputValue(tag);
        onSearch(tag);
    };

    return (
        <div className={styles.searchBarContainer}>
            <form onSubmit={handleSubmit} className={styles.searchForm}>
                <div className={styles.searchInputWrapper}>
                    {/* 搜索图标 */}
                    <span className={styles.searchIcon}>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path
                                d="M9 16C12.866 16 16 12.866 16 9C16 5.13401 12.866 2 9 2C5.13401 2 2 5.13401 2 9C2 12.866 5.13401 16 9 16Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M18 18L13.95 13.95"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </span>

                    {/* 输入框 */}
                    <input
                        ref={inputRef}
                        type="text"
                        className={styles.searchInput}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="输入法语关键词，多个词空格隔开（按 / 键快速聚焦）..."
                        aria-label="搜索法语关键词"
                        autoComplete="off"
                    />

                    {/* 清空按钮 */}
                    {inputValue && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className={styles.clearBtn}
                            title="清空"
                            aria-label="清空输入框"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* 搜索按钮 */}
                <button
                    type="submit"
                    className={styles.searchSubmitBtn}
                    disabled={loading || !inputValue.trim()}
                >
                    {loading ? (
                        <span className={styles.btnSpinner}></span>
                    ) : (
                        <span>搜索</span>
                    )}
                </button>
            </form>

            {/* 热门关键词快捷标签 */}
            <div className={styles.hotKeywordsArea}>
                <span className={styles.hotKeywordsLabel}>常用检索：</span>
                <div className={styles.hotKeywordsList}>
                    {HOT_KEYWORDS.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            className={`${styles.hotKeywordChip} ${
                                inputValue.trim() === tag ? styles.hotKeywordChipActive : ''
                            }`}
                            onClick={() => handleTagClick(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
