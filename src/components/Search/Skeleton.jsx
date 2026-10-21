import React from 'react';
import styles from './search.module.css';

export default function Skeleton() {
    return (
        <div className={styles.skeletonContainer}>
            {[1, 2, 3].map((key) => (
                <div key={key} className={styles.skeletonCard}>
                    <div className={styles.skeletonHeader}>
                        <div className={styles.skeletonBadge}></div>
                        <div className={styles.skeletonTitle}></div>
                        <div className={styles.skeletonCount}></div>
                    </div>
                    <div className={styles.skeletonBody}>
                        <div className={styles.skeletonLine}></div>
                        <div className={styles.skeletonLine} style={{ width: '92%' }}></div>
                        <div className={styles.skeletonLine} style={{ width: '80%' }}></div>
                    </div>
                </div>
            ))}
        </div>
    );
}
