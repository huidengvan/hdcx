

import React from 'react';
import toast from 'react-hot-toast';


const userConfirmedDetails = new WeakSet();

export const getTargetNode = (target) => {
    if (typeof document === 'undefined') return null;
    return document.getElementById(target);
};

export const getSecretDharmaWarning = (details) => {
    if (!details) return null;

    let el = details.previousElementSibling;
    let count = 0;
    while (el && count < 6) {
        const isAdmonition =
            el.classList?.contains('theme-admonition') ||
            el.classList?.contains('alert') ||
            /theme-admonition|alert--warning/.test(el.className || '');

        const targetAlert = isAdmonition
            ? el
            : el.querySelector?.('.theme-admonition, .alert, [class*="theme-admonition"]');

        if (targetAlert) {
            const fullText = (targetAlert.innerText || targetAlert.textContent || '').trim();
            if (
                fullText.includes('密法') ||
                fullText.includes('灌顶') ||
                fullText.includes('密宗') ||
                fullText.includes('请勿阅读') ||
                fullText.includes('警告')
            ) {
                const headingEl = targetAlert.querySelector('[class*="admonitionHeading"], .alert__title, h5');
                const contentEl = targetAlert.querySelector('[class*="admonitionContent"], .alert__content');

                const title = headingEl ? headingEl.innerText.trim() : '密法警告';
                let text = contentEl ? contentEl.innerText.trim() : '';

                if (!text) {
                    text = fullText.replace(title, '').trim();
                }

                return {
                    element: targetAlert,
                    title: title || '密法警告',
                    text: text || '须得受过密法灌顶，方能阅读此文'
                };
            }
        }

        if (el.tagName === 'DETAILS') {
            break;
        }

        el = el.previousElementSibling;
        count++;
    }

    return null;
};

export const openDetails = (details) => {
    if (!details) return;

    const isCollapsed = details.getAttribute('data-collapsed') === 'true' || !details.open;
    if (isCollapsed) {
        const summary = details.querySelector('summary');
        if (summary) {
            summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
    }

    details.open = true;
    details.setAttribute('open', '');

    const content = details.querySelector('[class*="collapsibleContent"]');
    if (content && content.parentElement) {
        content.parentElement.style.setProperty('display', 'block', 'important');
        content.parentElement.style.setProperty('height', 'auto', 'important');
        content.parentElement.style.setProperty('overflow', 'visible', 'important');
    }
};

export const closeDetails = (details) => {
    if (!details) return;

    const isOpen = details.getAttribute('data-collapsed') === 'false' || details.open;
    if (isOpen) {
        const summary = details.querySelector('summary');
        if (summary) {
            summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
    }

    details.open = false;
    details.removeAttribute('open');
};

let activeHighlightNode = null;
let activeHighlightTimer = null;
let activeHighlightCleanupTimer = null;

export const highlightParagraph = (targetNode, duration = 2500) => {
    if (!targetNode) return;

    if (activeHighlightNode && activeHighlightNode !== targetNode) {
        activeHighlightNode.style.backgroundColor = '';
        activeHighlightNode.style.boxShadow = '';
        activeHighlightNode.style.borderLeft = '';
        activeHighlightNode.style.transition = '';
    }
    if (activeHighlightTimer) clearTimeout(activeHighlightTimer);
    if (activeHighlightCleanupTimer) clearTimeout(activeHighlightCleanupTimer);

    activeHighlightNode = targetNode;

    // 使用 inset box-shadow 替代 borderLeft，完全不改变元素盒模型尺寸与排版流，文字绝不发生任何位移与折行变动
    targetNode.style.boxShadow = 'inset 3px 0 0 #2e8555';
    targetNode.style.backgroundColor = 'rgba(46, 133, 85, 0.2)';
    targetNode.style.transition = 'background-color 0.5s ease, box-shadow 0.5s ease';

    activeHighlightTimer = setTimeout(() => {
        targetNode.style.backgroundColor = '';
        targetNode.style.boxShadow = 'none';
        activeHighlightCleanupTimer = setTimeout(() => {
            if (activeHighlightNode === targetNode) {
                targetNode.style.boxShadow = '';
                targetNode.style.borderLeft = '';
                targetNode.style.transition = '';
                activeHighlightNode = null;
            }
        }, 500);
    }, duration);
};

export const scrollToTarget = (targetNode, scrollBlock) => {
    if (!targetNode) return;
    const block = scrollBlock || sessionStorage.getItem('scrollBlock') || 'center';
    targetNode.scrollIntoView({ block, behavior: 'smooth' });
    highlightParagraph(targetNode, 2500);
};

export const showSecretDharmaPrompt = ({ warning, details, targetNode, scrollBlock }) => {
    if (warning.element) {
        warning.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

    toast.custom(
        (t) => (
            <div
                style={{
                    maxWidth: '92vw',
                    width: '420px',
                    backgroundColor: isDark ? '#242526' : '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
                    border: isDark ? '1px solid #4d3d1a' : '1px solid #fed7aa',
                    overflow: 'hidden',
                    pointerEvents: 'auto',
                    fontFamily: 'inherit',
                    animation: t.visible ? 'scaleIn 0.2s ease-out' : 'scaleOut 0.2s ease-in',
                    zIndex: 99999,
                }}
            >
                <div
                    style={{
                        backgroundColor: isDark ? '#332b1a' : '#fffbeb',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: isDark ? '1px solid #4d3d1a' : '1px solid #fef3c7',
                    }}
                >
                    <span style={{ fontSize: '18px', lineHeight: 1 }}>⚠️</span>
                    <strong style={{ color: isDark ? '#fbbf24' : '#92400e', fontSize: '15px' }}>
                        {warning.title}
                    </strong>
                </div>
                <div
                    style={{
                        padding: '16px',
                        color: isDark ? '#e5e7eb' : '#374151',
                        fontSize: '14.5px',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {warning.text}
                </div>
                <div
                    style={{
                        padding: '10px 16px 14px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        backgroundColor: isDark ? '#1a1b1c' : '#f9fafb',
                        borderTop: isDark ? '1px solid #333' : '1px solid #f3f4f6',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => toast.dismiss(t.id)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: isDark ? '1px solid #4b5563' : '1px solid #d1d5db',
                            backgroundColor: isDark ? '#2f3032' : '#ffffff',
                            color: isDark ? '#d1d5db' : '#4b5563',
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            toast.dismiss(t.id);
                            userConfirmedDetails.add(details);
                            openDetails(details);
                            requestAnimationFrame(() => {
                                scrollToTarget(targetNode, scrollBlock);
                            });
                            setTimeout(() => {
                                scrollToTarget(targetNode, scrollBlock);
                            }, 120);
                            setTimeout(() => {
                                scrollToTarget(targetNode, scrollBlock);
                            }, 350);
                        }}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#2e8555',
                            color: '#ffffff',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(46, 133, 85, 0.25)',
                        }}
                    >
                        确定打开
                    </button>
                </div>
            </div>
        ),
        { id: 'secret-dharma-confirm', duration: Infinity }
    );
};

export const locateParagraph = (currentPara, retryCount = 0) => {
    if (typeof window === 'undefined' || !currentPara) return;
    if (/^\d+$/.test(currentPara)) { currentPara = `p${currentPara}`; }

    const targetNode = getTargetNode(currentPara);
    if (!targetNode) {
        if (retryCount < 8) {
            setTimeout(() => {
                locateParagraph(currentPara, retryCount + 1);
            }, 100);
        }
        return;
    }

    const scrollBlock = sessionStorage.getItem('scrollBlock');
    const details = targetNode.tagName === 'DETAILS' ? targetNode : targetNode.closest('details');

    if (details) {
        const warning = getSecretDharmaWarning(details);

        if (warning && !userConfirmedDetails.has(details)) {
            closeDetails(details);
            showSecretDharmaPrompt({ warning, details, targetNode, scrollBlock });
            return;
        }

        if (!details.open || details.getAttribute('data-collapsed') === 'true') {
            openDetails(details);
        }
    }

    scrollToTarget(targetNode, scrollBlock);
};

export const parseTime = (timeString) => {
    if (!timeString) return timeString

    if (timeString?.split(':').length == 1) {
        return parseInt(timeString)
    }

    if (timeString?.split(':').length == 2) {
        timeString = '00:' + timeString
    }
    const parts = timeString?.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]?.replace(',', '.'));
    return hours * 3600 + minutes * 60 + (seconds || 0);
};


export const parseSubtitles = (data, src) => {
    if (!data) return;

    const subtitlesArray = [];
    const subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));

    subtitleLines.forEach((line) => {
        const parts = line.trim()?.split(new RegExp('\r?\n'));
        const index = parts[0];
        const time = parts[1]?.split(' --> ');
        const text = parts.slice(2).join('\n');
        const timeStart = time[0];
        const timeEnd = time[1];

        subtitlesArray.push({ index, startTime: timeStart, endTime: timeEnd, text });
    });

    return subtitlesArray;
};


export const fetchText = async (suburl) => {
    try {
        const response = await fetch(suburl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.text();
        if (!data.includes('failed')) {
            return data;
        }
        return ''
    } catch (e) {
        console.error(e);
    }
};
