import React, { useState, useCallback } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import styles from './index.module.css';
import { exportTxt, exportPdf, exportEpub } from './downloadUtils';

/**
 * 离线文档下载面板组件（独立拆分，负责渲染下载卡片与交互状态）
 */
export default function DownloadSection({ onRequestClose }) {
    const [includeAnchors, setIncludeAnchors] = useLocalStorageState('docDownloadIncludeAnchors', {
        defaultValue: false,
    });
    const [isEpubLoading, setIsEpubLoading] = useState(false);

    // 1. PDF 下载
    const handlePdf = useCallback(() => {
        exportPdf(includeAnchors, onRequestClose);
    }, [includeAnchors, onRequestClose]);

    // 2. EPUB 电子书下载
    const handleEpub = useCallback(async () => {
        setIsEpubLoading(true);
        try {
            await exportEpub(includeAnchors);
        } finally {
            setIsEpubLoading(false);
        }
    }, [includeAnchors]);

    // 3. TXT 纯文本下载
    const handleTxt = useCallback(() => {
        exportTxt(includeAnchors);
    }, [includeAnchors]);

    return (
        <div className={styles.section}>
            <div className={styles.sectionLabelRow}>
                <span className={styles.label}>下载本篇</span>
                <span className={styles.subLabel}>离线保存</span>
            </div>

            <div className={styles.downloadGrid}>
                {/* PDF 格式 */}
                <button
                    className={styles.downloadBtn}
                    onClick={handlePdf}
                    title="调用系统打印，请在打印弹窗选择「另存为 PDF」保存"
                    aria-label="下载 PDF"
                >
                    <svg className={styles.downloadIcon} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M9 13v4m0-2h2a1 1 0 0 0 1-1v0a1 1 0 0 0-1-1H9z" />
                    </svg>
                    <span>PDF</span>
                </button>

                {/* EPUB 格式 */}
                <button
                    className={styles.downloadBtn}
                    onClick={handleEpub}
                    disabled={isEpubLoading}
                    title="下载 EPUB 电子书（适配微信读书、Apple Books）"
                    aria-label="下载 EPUB"
                >
                    {isEpubLoading ? (
                        <svg className={styles.spinnerIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg className={styles.downloadIcon} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5z" />
                            <line x1="8" y1="7" x2="16" y2="7" />
                            <line x1="8" y1="11" x2="16" y2="11" />
                        </svg>
                    )}
                    <span>{isEpubLoading ? '...' : 'EPUB'}</span>
                </button>

                {/* TXT 纯文本 */}
                <button
                    className={styles.downloadBtn}
                    onClick={handleTxt}
                    title="下载 TXT 纯文本（已去除 Markdown 井号）"
                    aria-label="下载 TXT"
                >
                    <svg className={styles.downloadIcon} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="18" x2="14" y2="18" />
                    </svg>
                    <span>TXT</span>
                </button>
            </div>

            {/* 段落行号保留选项 */}
            <div className={styles.anchorOptionRow}>
                <label className={styles.checkboxLabel} title="控制下载的文件中是否包含 [p1] 等段落行号标记">
                    <input
                        type="checkbox"
                        checked={includeAnchors}
                        onChange={(e) => setIncludeAnchors(e.target.checked)}
                        className={styles.checkboxInput}
                    />
                    <span>包含段落行号</span>
                </label>
            </div>

            <div className={styles.downloadTip}>
                * PDF 调起打印后选「另存为 PDF」
            </div>
        </div>
    );
}

