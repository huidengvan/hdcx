import React from 'react';
import styles from './search.module.css';

/**
 * 分页组件
 * @param {{
 *   total: number,
 *   pageSize: number,
 *   page: number,
 *   onChange: (p: number) => void
 * }} props
 */
export default function Pagination({ total, pageSize, page, onChange }) {
    const totalPages = Math.ceil(total / pageSize);

    if (totalPages <= 1) {
        return null;
    }

    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 7;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // 始终显示第 1 页
            pages.push(1);

            let start = Math.max(2, page - 1);
            let end = Math.min(totalPages - 1, page + 1);

            if (page <= 3) {
                end = 4;
            } else if (page >= totalPages - 2) {
                start = totalPages - 3;
            }

            if (start > 2) {
                pages.push('...');
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < totalPages - 1) {
                pages.push('...');
            }

            // 始终显示最后一页
            pages.push(totalPages);
        }

        return pages;
    };

    const handlePageClick = (p) => {
        if (typeof p === 'number' && p !== page && p >= 1 && p <= totalPages) {
            onChange(p);
            // 平滑滚动回顶部
            if (typeof window !== 'undefined') {
                window.scrollTo({ top: 120, behavior: 'smooth' });
            }
        }
    };

    return (
        <nav className={styles.paginationNav} aria-label="分页导航">
            {/* 上一页 */}
            <button
                type="button"
                className={styles.pageBtn}
                onClick={() => handlePageClick(page - 1)}
                disabled={page <= 1}
                aria-label="上一页"
            >
                ‹ 上一页
            </button>

            {/* 页码序列 */}
            <div className={styles.pageNumbers}>
                {getPageNumbers().map((p, idx) => {
                    if (p === '...') {
                        return (
                            <span key={`ellipsis-${idx}`} className={styles.pageEllipsis}>
                                …
                            </span>
                        );
                    }

                    const isCurrent = p === page;
                    return (
                        <button
                            key={p}
                            type="button"
                            className={`${styles.pageBtn} ${styles.pageNumberBtn} ${
                                isCurrent ? styles.pageBtnActive : ''
                            }`}
                            onClick={() => handlePageClick(p)}
                            aria-current={isCurrent ? 'page' : undefined}
                        >
                            {p}
                        </button>
                    );
                })}
            </div>

            {/* 下一页 */}
            <button
                type="button"
                className={styles.pageBtn}
                onClick={() => handlePageClick(page + 1)}
                disabled={page >= totalPages}
                aria-label="下一页"
            >
                下一页 ›
            </button>
        </nav>
    );
}
