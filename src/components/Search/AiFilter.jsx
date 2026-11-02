import React from 'react';
import { ragFilters } from './ragApi';
import styles from './ai.module.css';

/**
 * AI 搜索按分类筛选（多选），与关键词搜索的分类筛选一致；未选任何分类表示全部
 * @param {{
 *   selected: string[],
 *   onChange: (cats: string[]) => void
 * }} props
 */
export default function AiFilter({ selected, onChange }) {
    const toggle = (id) => onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
    return (
        <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
                <button
                    type="button"
                    className={`${styles.filterChip} ${selected.length === 0 ? styles.filterChipActive : ''}`}
                    onClick={() => onChange([])}
                >
                    全部
                </button>
                {ragFilters.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        className={`${styles.filterChip} ${selected.includes(id) ? styles.filterChipActive : ''}`}
                        onClick={() => toggle(id)}
                        aria-pressed={selected.includes(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
