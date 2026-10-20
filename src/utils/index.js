

import React from 'react';
import toast from 'react-hot-toast';

export const ignoredCharacters = /[【】〖〗\[\]《》：:"'“”]/g;

export const bgColors = [
    { name: '褐色', color: '#FFF2E2' },
    { name: '绿色', color: '#CCE8CF' },
    { name: '黄色', color: '#FAF9DE' },
    { name: '白色', color: 'white' }
];

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

export const scrollToTarget = (targetNode, scrollBlock) => {
    if (!targetNode) return;
    const block = scrollBlock || sessionStorage.getItem('scrollBlock') || 'center';
    targetNode.scrollIntoView({ block, behavior: 'smooth' });
    targetNode.style.borderLeft = '.5px solid #2e8555';
    targetNode.style.transition = 'background-color 0.5s ease';
    targetNode.style.backgroundColor = 'rgba(46, 133, 85, 0.2)';
    setTimeout(() => {
        targetNode.style.backgroundColor = '';
    }, 2500);
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

export function getStartNode(targetPara) {
    return document.getElementById(decodeURI(targetPara))?.nextElementSibling
}

export function getRxlSection(lesson) {
    const sections = [
        { range: [1, 14], section: '01' },
        { range: [15, 28], section: '02' },
        { range: [29, 35], section: '03' },
        { range: [36, 46], section: '04' },
        { range: [47, 69], section: '05' },
        { range: [70, 94], section: '06' },
        { range: [95, 110], section: '07' },
        { range: [111, 152], section: '08' },
        { range: [153, 190], section: '09' },
        { range: [191, 201], section: '10' },
    ];

    const foundSection = sections.find(({ range }) => lesson >= range[0] && lesson <= range[1]);
    return foundSection ? foundSection.section : undefined;
}

export function getRxlEndNode(startPara) {
    const match = startPara?.match(/入菩萨行论第(\d+)节课/);
    if (!match) return;

    const specialEndNodes = {
        '14': 'p833',
        '28': 'p841',
        '35': 'p374',
        '46': 'p567',
        '69': 'p1500',
        '94': 'p1945',
        '110': 'p1444',
        '152': 'p3881',
        '190': 'p4320',
        '201': 'p1311'
    };

    const lessonNumber = match[1];
    const endNode = specialEndNodes[lessonNumber] || `入菩萨行论第${parseInt(lessonNumber) + 1}节课`;

    if (/p\d+/.test(endNode)) {
        return getTargetNode(endNode);
    }

    return getTargetNode(endNode)?.previousElementSibling;
}

export function filterFootnote(node) {
    if (!node) return;

    if (node.previousElementSibling.tagName === 'HR') {
        return node.previousElementSibling?.previousElementSibling
    }

    if (/\[\d+\]/.test(node.textContent)) {
        return filterFootnote(node.previousElementSibling)
    }

    return node
}

export function isSameLesson(lesson, title) {
    if (!lesson || !title) return;

    // 检查主题是否包含相同的内容
    const themeCheck = lesson.includes("入菩萨行论") && title.includes("入行论广解");

    // 提取课次
    const lessonNumber1 = lesson.match(/第(\d+)/) ? lesson.match(/第(\d+)/)[1] : null;
    const lessonNumber2 = title.match(/广解(\d+)/) ? title.match(/广解(\d+)/)[1] : null;
    // console.log(themeCheck, lessonNumber1, title,lessonNumber2);

    // 返回主题和课次是否相同
    return themeCheck && parseInt(lessonNumber1) === parseInt(lessonNumber2);
}

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

export const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60);

    // 格式化为两位数
    const formattedHours = String(hours).padStart(2, '0') + ':';
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds?.split('.')[0]).padStart(2, '0');
    const formattedMillSeconds = seconds?.split('.')[1]?.slice(0, 3);

    return `${formattedHours}${formattedMinutes}:${formattedSeconds},${formattedMillSeconds}`;
};

export const parseSubtitles = (data, duration, src, keqianTime) => {
    // console.log({ data, src });
    if (!data) return;

    let matchRxl = src?.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)

    const subtitlesArray = [];
    let subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));
    if (matchRxlQa) {
        subtitleLines = subtitleLines.slice(21)
    }

    subtitleLines.forEach((line) => {
        const parts = line.trim()?.split(new RegExp('\r?\n'));
        const index = parts[0];
        const time = parts[1]?.split(' --> ');
        const text = parts.slice(2).join('\n');
        let timeStart = time[0]
        let timeEnd = time[1]

        if ((matchRxl || matchRxlQa) && parseTime(timeStart) > keqianTime + 5) {
            timeStart = formatTime(parseTime(timeStart) + (duration - 2870))
            timeEnd = formatTime(parseTime(timeEnd) + (duration - 2870))
        }

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

export const isShortKesong = (lessonNo) => (['31', '32'].includes(lessonNo) || parseInt(lessonNo) >= 47)

export const getLessonNo = (pathSegment) => pathSegment.match(/广解(\d+)/)[1] 
