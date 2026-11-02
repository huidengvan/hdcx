import React, { memo, useEffect, useState, useRef, useMemo } from 'react';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { parseTime, parseSubtitles, fetchText } from '@site/src/utils';
import { useVideo } from './VideoContext';
import toast from 'react-hot-toast';

// 四册课程视频的字幕在本站 static/docs/srts/b1~b4，文件名与视频相同
const SRT_BOOKS = { 慧灯禅修课第一册: 'b1', 慧灯禅修课第二册: 'b2', 慧灯禅修课第三册: 'b3', 慧灯禅修课第四册: 'b4' };

// decodeURI 遇到残缺的 % 编码会抛错，失败时原样返回
const safeDecode = (str) => {
    try {
        return decodeURI(str || '');
    } catch (e) {
        return str || '';
    }
};

// 查找 time 所在的字幕：先查当前句与下一句（顺序播放时 O(1)），未命中再二分查找（拖动进度时）
const findSubtitleIndex = (subs, time, hint) => {
    const hit = (i) => i >= 0 && i < subs.length && time >= subs[i].startSec && time <= subs[i].endSec;
    if (hit(hint)) return hint;
    if (hit(hint + 1)) return hint + 1;

    let lo = 0;
    let hi = subs.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (time < subs[mid].startSec) hi = mid - 1;
        else if (time > subs[mid].endSec) lo = mid + 1;
        else return mid;
    }
    return -1;
};

// 单行字幕：memo 后切换当前句时只有新旧两行重渲染；点击由列表统一代理
const SubtitleItem = memo(function SubtitleItem({ sub, index, isActive, showTimeLine }) {
    return (
        <li
            id={`subtitle-${index}`}
            data-index={index}
            className={`${styles.transcriptItem} ${isActive ? styles.activeItem : ''}`}
            title="点击跳转到该句播放"
        >
            {showTimeLine && (
                <span className={styles.timeBadge} data-copy="true" title="点击复制此时间点链接">
                    {sub.startTime?.split(',')[0]}
                </span>
            )}
            <p className={`${styles.transcriptText} ${isActive ? styles.activeText : ''}`}>
                {sub.text}
            </p>
        </li>
    );
});

const VideoPlayer = ({ src, current, setCurrent }) => {
    const baseUrl = typeof window !== 'undefined' && location.hash.includes('http')
        ? ''
        : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/慧灯禅修课/';

    const initialVideoSrc = src || (typeof window !== 'undefined' && location.hash ? `${baseUrl}${location.hash.slice(1)}` : '');
    const [videoSrc, setVideoSrc] = useState(initialVideoSrc);

    const [subtitles, setSubtitles] = useState([]);
    const [isSubLoading, setIsSubLoading] = useState(false);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const currentIndexRef = useRef(-1);
    const videoRef = useVideo();
    const listRef = useRef(null);
    const fetchIdRef = useRef(0);
    const srtBase = useBaseUrl('/docs/srts/');

    // 片段结束时间（src 形如 "地址,结束时间"）；用 ref 保存，元数据加载后可按视频时长修正且不会被重渲染重置
    const endTimeRef = useRef();
    useEffect(() => {
        endTimeRef.current = parseTime(src?.split(',')[1]);
    }, [src]);
    const isMp4 = useMemo(() => /\.(mp4|webm)/i.test(videoSrc), [videoSrc]);

    const [playInfo, setPlayInfo] = useLocalStorageState('playInfo', {
        defaultValue: {
            showTimeLine: true,
            subAlignCenter: true,
        }
    });

    const selectSubtitle = (index) => {
        currentIndexRef.current = index;
        setCurrentSubtitleIndex(index);
    };

    // PC 端默认使用宽屏 UI
    const isFullWidth = true;
    const hasSubtitles = subtitles && subtitles.length > 0;
    const showTranscript = isSubLoading || hasSubtitles;

    // 格式化展示的视频标题
    const displayTitle = useMemo(() => {
        const raw = videoSrc ? safeDecode(videoSrc.slice(videoSrc.lastIndexOf('/') + 1)) : '';
        return raw.split('?')[0].split('#')[0].replace(/\.(mp4|webm|mp3|m4a)/i, '');
    }, [videoSrc]);

    useEffect(() => {
        if (src && src !== videoSrc) {
            setVideoSrc(src);
        }
        if (videoRef.current) {
            const matchJx = /\/v\/[45]jx/.test(videoSrc);
            if (matchJx) {
                videoRef.current.pause();
            }
        }

        // 切换媒体后作废尚未返回的旧字幕请求，并清空当前句
        fetchIdRef.current++;
        setSubtitles([]);
        selectSubtitle(-1);
        const isHdcx = typeof window !== 'undefined' &&
            [location.hash, videoSrc, src].some(s => safeDecode(s).includes('慧灯禅修课'));

        if (isHdcx) {
            setIsSubLoading(true);
        } else {
            setIsSubLoading(false);
        }
    }, [src, videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = ({ target: { currentTime } }) => {
            const endTime = endTimeRef.current;
            if (endTime && currentTime >= endTime) {
                video?.removeEventListener('timeupdate', handleTimeUpdate);
                if (setCurrent) setCurrent(prev => prev + 1);
                return;
            }

            const subIndex = findSubtitleIndex(subtitles, currentTime, currentIndexRef.current);
            if (subIndex !== -1 && subIndex !== currentIndexRef.current) {
                selectSubtitle(subIndex);

                if (playInfo.subAlignCenter && subtitles.length - subIndex > 2) {
                    scrollSubtitleToView(subIndex);
                }
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [subtitles, playInfo?.subAlignCenter, setCurrent]);

    const handleVideoEnd = () => {
        if (videoSrc !== 'blank' && setCurrent) {
            setCurrent(prev => prev + 1);
        }
    };

    const scrollSubtitleToView = (index) => {
        const el = document.getElementById(`subtitle-${index}`);
        const list = listRef.current;
        if (!el || !list) return;

        // 仅滚动字幕卡片内部容器，使正在播放的字幕定位在字幕框约 40% 高度的位置
        const elTop = el.offsetTop;
        const elHeight = el.offsetHeight;
        const containerHeight = list.clientHeight;
        const targetScrollTop = elTop - (containerHeight * 0.4) + (elHeight / 2);

        list.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth',
        });
    };

    const handleSubtitleFetch = async (suburl) => {
        // 只采用最新一次请求的结果，防止快速切换时旧视频的字幕晚到并覆盖
        const fetchId = ++fetchIdRef.current;
        setIsSubLoading(true);
        let subtitlesArray = [];
        try {
            const subText = await fetchText(suburl);
            if (subText && subText.trim()) {
                subtitlesArray = parseSubtitles(subText);
            }
        } catch (e) {
            console.error('获取字幕失败', e);
        }
        if (fetchId !== fetchIdRef.current) return;
        setSubtitles(subtitlesArray);
        setIsSubLoading(false);
    };

    const handleLoadedMetadata = (event) => {
        const { duration: videoDuration } = event?.target;
        if (videoSrc === 'blank') {
            videoRef?.current?.pause();
        }

        const [, series, title] = safeDecode(videoSrc).match(/([^/]+)\/([^/]+?)\.mp4/) || [];
        if (SRT_BOOKS[series]) {
            handleSubtitleFetch(`${srtBase}${SRT_BOOKS[series]}/${encodeURIComponent(title)}.srt`);
        } else {
            setIsSubLoading(false);
            setSubtitles([]);
        }

        // 片段结束时间与视频结尾相差不到 1 秒时忽略，交给 ended 事件切换下一个
        if (videoDuration - endTimeRef.current <= 1) {
            endTimeRef.current = undefined;
        }
    };

    // 点击时间戳复制链接
    const handleCopyTimestamp = async (sub) => {
        const base = window.location.href.split('#t=')[0];
        const link = `${base}#t=${sub.startSec}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success(`已复制定位时间: ${sub.startTime?.split(',')[0]}`);
        } catch (err) {
            toast.error('复制失败，请手动复制');
        }
    };

    // 字幕列表点击代理：点时间戳复制链接，点其余位置跳转到该句
    const handleListClick = (e) => {
        const item = e.target.closest('li[data-index]');
        if (!item) return;
        const index = Number(item.dataset.index);
        const sub = subtitles[index];
        if (!sub) return;

        if (e.target.closest('[data-copy]')) {
            handleCopyTimestamp(sub);
        } else if (videoRef.current) {
            videoRef.current.currentTime = sub.startSec;
            selectSubtitle(index);
        }
    };

    return (
        <div className={`${styles.container} ${isFullWidth ? styles.containerFull : ''}`}>
            <div className={`${styles.layout} ${isFullWidth ? styles.layoutFull : ''}`}>
                {/* 左侧：播放器区域 */}
                <div className={`${styles.playerCard} ${isFullWidth ? styles.playerCardFull : ''} ${!showTranscript ? styles.playerCardSolo : ''}`}>
                    {isMp4 ? (
                        <div className={`${styles.videoWrapper} ${isFullWidth ? styles.videoWrapperFull : ''}`}>
                            <video
                                ref={videoRef}
                                className={styles.video}
                                src={videoSrc}
                                controls
                                playsInline
                                webkit-playsinline="true"
                                x5-playsinline="true"
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={handleVideoEnd}
                                autoPlay={current !== 0}
                                poster={/\/v\/[45]jx/.test(videoSrc) ? 'https://box.hdcxb.net/d/其他资料/f/up/untitled.png' : ''}
                            />
                        </div>
                    ) : (
                        <div className={`${styles.audioWrapper} ${isFullWidth ? styles.audioWrapperFull : ''}`}>
                            <img
                                className={styles.audioCover}
                                src="https://hdcx.s3.ap-northeast-1.wasabisys.com/hdv/p/上师.jpg"
                                alt="音频封面"
                            />
                            <audio
                                ref={videoRef}
                                className={styles.audioPlayer}
                                src={videoSrc}
                                controls
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={handleVideoEnd}
                                autoPlay={current !== 0}
                            />
                        </div>
                    )}

                    {/* 媒体标题栏 */}
                    <div className={`${styles.mediaMeta} ${isFullWidth ? styles.mediaMetaFull : ''}`}>
                        <div className={styles.mediaTitleWrapper}>
                            <span className={styles.mediaBadge}>{isMp4 ? '视频' : '音频'}</span>
                            <h3 className={styles.mediaTitle} title={displayTitle}>
                                {displayTitle || '媒体播放'}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* 右侧：同步字幕面板（正在加载骨架屏或已有字幕时显示，没有字幕时隐藏） */}
                {showTranscript && (
                    <div className={`${styles.transcriptCard} ${isFullWidth ? styles.transcriptCardFull : ''}`}>
                        {/* 面板头部 */}
                        <div className={styles.transcriptHeader}>
                            {/* 功能选项 */}
                            <div className={styles.transcriptActions}>
                                <button
                                    className={`${styles.pillToggle} ${playInfo?.showTimeLine ? styles.pillToggleActive : ''}`}
                                    onClick={() => setPlayInfo(prev => ({ ...prev, showTimeLine: !prev.showTimeLine }))}
                                    title={playInfo?.showTimeLine ? '隐藏时间轴' : '显示时间轴'}
                                >
                                    <svg className={styles.pillIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>时间轴</span>
                                </button>

                                <button
                                    className={`${styles.pillToggle} ${playInfo?.subAlignCenter ? styles.pillToggleActive : ''}`}
                                    onClick={() => setPlayInfo(prev => ({ ...prev, subAlignCenter: !prev.subAlignCenter }))}
                                    title={playInfo?.subAlignCenter ? '关闭自动跟随' : '开启自动跟随'}
                                >
                                    <svg className={styles.pillIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="21" y1="6" x2="3" y2="6" />
                                        <line x1="17" y1="12" x2="7" y2="12" />
                                        <line x1="19" y1="18" x2="5" y2="18" />
                                    </svg>
                                    <span>自动跟随</span>
                                </button>
                            </div>
                        </div>

                        {/* 字幕行滚动列表 */}
                        <ul ref={listRef} className={styles.transcriptList} onClick={handleListClick}>
                            {isSubLoading ? (
                                <div className={styles.skeletonContainer}>
                                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                        <div key={i} className={styles.skeletonItem}>
                                            {playInfo?.showTimeLine && <div className={styles.skeletonTime} />}
                                            <div className={styles.skeletonContent}>
                                                <div
                                                    className={styles.skeletonLine}
                                                    style={{ width: `${65 + ((i * 19) % 30)}%` }}
                                                />
                                                {i % 2 === 0 && (
                                                    <div
                                                        className={styles.skeletonLineShort}
                                                        style={{ width: `${40 + ((i * 13) % 25)}%` }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                subtitles.map((sub, index) => (
                                    <SubtitleItem
                                        key={index}
                                        sub={sub}
                                        index={index}
                                        isActive={index === currentSubtitleIndex}
                                        showTimeLine={!!playInfo?.showTimeLine}
                                    />
                                ))
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default function SubtitleContext(props) {
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => <VideoPlayer {...props} />}
        </BrowserOnly>
    );
}