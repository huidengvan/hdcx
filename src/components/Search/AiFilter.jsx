import React from 'react';
import { ragCategories } from './ragApi';
import styles from './ai.module.css';

/**
 * AI 搜索范围筛选：分类 → 册，多选；未选任何册表示搜索全部
 * @param {{
 *   selected: string[],
 *   onChange: (groups: string[]) => void
 * }} props
 */
export default function AiFilter({ selected, onChange }) {
    const selectedSet = new Set(selected);

    const toggleGroup = (id) => {
        const next = new Set(selectedSet);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange([...next]);
    };

    // 点击分类：已全选则取消该分类，否则选中该分类下全部册
    const toggleCategory = (cat) => {
        const ids = cat.groups.map((g) => g.id);
        const allOn = ids.every((id) => selectedSet.has(id));
        const next = new Set(selectedSet);
        ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
        onChange([...next]);
    };

    return (
        <div className={styles.filterBar}>
            <button
                type="button"
                className={`${styles.filterChip} ${selected.length === 0 ? styles.filterChipActive : ''}`}
                onClick={() => onChange([])}
            >
                全部
            </button>
            {ragCategories.map((cat) => {
                const allOn = cat.groups.every((g) => selectedSet.has(g.id));
                return (
                    <div key={cat.id} className={styles.filterGroup}>
                        <button
                            type="button"
                            className={`${styles.filterCategory} ${allOn ? styles.filterChipActive : ''}`}
                            onClick={() => toggleCategory(cat)}
                            title={`搜索${cat.label}全部内容`}
                        >
                            {cat.label}
                        </button>
                        {cat.groups.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                className={`${styles.filterChip} ${selectedSet.has(g.id) ? styles.filterChipActive : ''}`}
                                onClick={() => toggleGroup(g.id)}
                                aria-pressed={selectedSet.has(g.id)}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
