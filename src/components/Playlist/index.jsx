import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation } from '@docusaurus/router';
import SubtitleContext from '@site/src/components/SubtitleContext';
import styles from './playlist.module.css';
import { parseTime } from '@site/src/utils';
import useLocalStorageState from 'use-local-storage-state';
import toast from 'react-hot-toast';

export default function Playlist() {
    const location = useLocation();
    if (/^\/video\/?/.test(location.pathname)) return null;

    const params = new URLSearchParams(location.search);
    const urlsParam = params.get('urls');
    const uriParam = params.get('uri'); // 可以传入一个列表文件
    const currentParam = params.get('index');

    const urls = useMemo(() => urlsParam?.split('|') || null, [urlsParam]);
    const [current, setCurrent] = useState(Number(currentParam) || 0);

    const [edit, setEdit] = useState(false);
    const [urltext, setUrltext] = useLocalStorageState('playlist', { defaultValue: urls || [] });
    const [draftText, setDraftText] = useState('');

    const parseUri = useCallback(async () => {
        if (!uriParam) return;
        try {
            const res = await fetchTextFile(uriParam);
            if (res) {
                const lines = res.split(/\r?\n/).filter(line => line.trim() !== '');
                setUrltext(lines);
                toast.success('已成功加载播放列表');
            }
        } catch (e) {
            toast.error('加载播放列表文件失败');
        }
    }, [uriParam, setUrltext]);

    const buildSrc = (url) => {
        if (!url) return '';
        return url.split('@')[0].replace('^', '#t=');
    };

    useEffect(() => {
        if (urls && urls.length > 0 && urltext?.join() !== urls.join()) {
            setUrltext(urls);
        } else if (!urlsParam && uriParam) {
            parseUri();
        }
    }, [urls, urlsParam, uriParam, parseUri]);

    // 进入编辑模式
    const handleStartEdit = () => {
        setDraftText(urltext?.join('\n') || '');
        setEdit(true);
    };

    // 保存编辑
    const handleSaveEdit = () => {
        const cleaned = draftText.split('\n').map(l => l.trim()).filter(l => l !== '');
        setUrltext(cleaned);
        setEdit(false);
        toast.success(`播放列表已更新 (${cleaned.length} 条)`);
    };

    // 取消编辑
    const handleCancelEdit = () => {
        setEdit(false);
    };

    const handleSelectTrack = (index) => {
        setCurrent(index);
    };

    // 解析曲目展示标题
    const formatTrackTitle = (url) => {
        if (!url) return '';
        const titlePart = url.split('@')[1];
        if (titlePart) {
            return decodeURI(titlePart).replace(/\.(mp4|webm|mp3|m4a)/i, '');
        }
        const filePart = url.split('^')[0].split('/').pop();
        return decodeURI(filePart).replace(/\.(mp4|webm|mp3|m4a)/i, '');
    };

    const activeSrc = urltext && urltext.length > current ? buildSrc(urltext[current]) : '';

    return (
        <div className={styles.container}>
            {/* 顶部视频/音频播放与同步字幕 */}
            {activeSrc && (
                <SubtitleContext
                    src={activeSrc}
                    current={current}
                    setCurrent={setCurrent}
                />
            )}

            {/* 播放列表主卡片 */}
            <div className={styles.playlistCard}>
                {/* 卡片头部 */}
                <div className={styles.cardHeader}>
                    <div className={styles.headerLeft}>
                        <h2 className={styles.headerTitle}>
                            <svg className={styles.headerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>播放列表</span>
                        </h2>

                        {urltext && urltext.length > 0 && (
                            <span className={styles.badge}>共 {urltext.length} 讲</span>
                        )}

                        <Duration urltext={urls || urltext} setUrltext={setUrltext} />
                    </div>

                    <div className={styles.headerRight}>
                        {!edit ? (
                            <button
                                className={styles.actionBtn}
                                onClick={handleStartEdit}
                                title="编辑播放列表内容"
                            >
                                <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                                <span>编辑列表</span>
                            </button>
                        ) : (
                            <button
                                className={styles.actionBtn}
                                onClick={handleCancelEdit}
                                title="取消并退出编辑"
                            >
                                <span>取消</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* 编辑模式 */}
                {edit ? (
                    <div className={styles.editPanel}>
                        <div className={styles.editTip}>
                            <strong>格式提示：</strong>视频地址^起始时间,结束时间@显示标题（每行一个）。例：<code>https://...mp4^0,1800@第1课</code>
                        </div>
                        <textarea
                            className={styles.textarea}
                            rows={8}
                            placeholder="每行一个视频条目..."
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                        />
                        <div className={styles.editActions}>
                            <button className={styles.cancelBtn} onClick={handleCancelEdit}>
                                取消
                            </button>
                            <button className={styles.saveBtn} onClick={handleSaveEdit}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>应用修改</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* 曲目列表视图 */
                    <ul className={styles.trackList}>
                        {urltext && urltext.length > 0 ? (
                            urltext.map((url, index) => {
                                const isActive = current === index;
                                const title = formatTrackTitle(url);
                                const trackNum = String(index + 1).padStart(2, '0');

                                return (
                                    <li
                                        key={index}
                                        className={`${styles.trackItem} ${isActive ? styles.activeTrack : ''}`}
                                        onClick={() => handleSelectTrack(index)}
                                        title={`点击播放: ${title}`}
                                    >
                                        <div className={styles.trackMain}>
                                            <div className={styles.trackIndex}>
                                                {isActive ? (
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                    </svg>
                                                ) : (
                                                    trackNum
                                                )}
                                            </div>
                                            <span className={styles.trackTitle}>{title}</span>
                                        </div>

                                        {isActive && (
                                            <div className={styles.playingTag}>
                                                <div className={styles.equalizer}>
                                                    <span />
                                                    <span />
                                                    <span />
                                                </div>
                                                <span>正在播放</span>
                                            </div>
                                        )}
                                    </li>
                                );
                            })
                        ) : (
                            <div className={styles.emptyList}>
                                <p>播放列表中暂无视频，点击上方「编辑列表」添加条目。</p>
                            </div>
                        )}
                    </ul>
                )}
            </div>

            {/* 底部供奉吉祥图 */}
            <div className={styles.footer}>
                <img
                    className={styles.footerImg}
                    src="https://box.hdcxb.net/d/%E5%85%B6%E4%BB%96%E8%B5%84%E6%96%99/p/bajixiang.jpg"
                    alt="供八吉祥"
                    title="供奉八吉祥"
                />
            </div>
        </div>
    );
}

const Duration = ({ urltext, setUrltext }) => {
    const [totalDuration, setTotalDuration] = useState('');
    let videoUrls = urltext;
    let urlsLength = urltext?.length;

    const calculateTotalDuration = useCallback(async () => {
        if (!videoUrls || videoUrls.length === 0) return;
        let t = 0;
        for (let i = 0; i < videoUrls?.length; i++) {
            const item = videoUrls[i];

            if (!item?.includes('^')) {
                let url = item?.split('@')[0];
                let duration = await getVideoDuration(url);
                if (duration > 0) {
                    t += duration;
                    videoUrls[i] = `${item?.split('@')[0]}^0,${duration}${item?.split('@')?.length > 1 ? '@' + item?.split('@')[1] : ''}`;
                }
            } else {
                const times = item.split('^')[1].split('@')[0].split(',');
                t += (parseTime(times[1]) - parseTime(times[0]));
            }
        }

        let duration = parseFloat((t / 3600).toFixed(2));
        let hour = parseInt(duration);
        let minute = Math.round((duration - hour) * 60);
        if (duration > 0) {
            setTotalDuration(`${hour ? hour + '小时' : ''}${minute ? minute + '分钟' : ''}`);
        }
        if (urlsLength !== videoUrls?.length && setUrltext) {
            setUrltext(videoUrls);
        }
    }, [videoUrls, urlsLength, setUrltext]);

    useEffect(() => {
        calculateTotalDuration();
    }, [calculateTotalDuration]);

    return (
        <>
            {totalDuration && (
                <span className={styles.durationBadge}>
                    <svg className={styles.clockIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>总时长：{totalDuration}</span>
                </span>
            )}
        </>
    );
};

export async function getVideoDuration(videoUrl) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = videoUrl;
        video.onloadedmetadata = () => {
            resolve(Math.floor(video.duration));
            video.pause();
            video.src = '';
        };

        video.onerror = () => {
            resolve(0);
        };
    });
}

async function fetchTextFile(uri) {
    try {
        const response = await fetch(uri);
        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }
        return await response.text();
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
    }
}
