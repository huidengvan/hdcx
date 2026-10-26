import React, { useEffect, useState, useRef, useMemo } from 'react';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { parseTime, parseSubtitles, fetchText } from '@site/src/utils';
import { useVideo } from './VideoContext';
import toast from 'react-hot-toast';

const VideoPlayer = ({ src, current, setCurrent }) => {
    const baseUrl = typeof window !== 'undefined' && location.hash.includes('http')
        ? ''
        : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/慧灯禅修课/';

    const initialVideoSrc = src || (typeof window !== 'undefined' && location.hash ? `${baseUrl}${location.hash.slice(1)}` : '');
    const [videoSrc, setVideoSrc] = useState(initialVideoSrc);

    const [subtitles, setSubtitles] = useState([]);
    const [isSubLoading, setIsSubLoading] = useState(false);
    const [subFetchCompleted, setSubFetchCompleted] = useState(false);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const videoRef = useVideo();
    const listRef = useRef(null);

    let endTime = useMemo(() => parseTime(src?.split(',')[1]), [src]);
    const isMp4 = useMemo(() => /\.(mp4|webm)/i.test(videoSrc), [videoSrc]);

    const [playInfo, setPlayInfo] = useLocalStorageState('playInfo', {
        defaultValue: {
            paused: true,
            showTimeLine: true,
            subAlignCenter: true,
            currentTime: 0,
            title: '',
            current: 0,
            playbackRate: 1,
            fullWidth: false,
        }
    });

    const isFullWidth = Boolean(playInfo?.fullWidth);
    const hasSubtitles = subtitles && subtitles.length > 0;
    const showTranscript = isSubLoading || hasSubtitles;

    // 格式化展示的视频标题
    const displayTitle = useMemo(() => {
        const raw = videoSrc ? decodeURI(videoSrc.slice(videoSrc.lastIndexOf('/') + 1)) : '';
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

        setPlayInfo(prev => ({
            ...prev,
            title: src?.slice(src?.lastIndexOf('/') + 1) || ''
        }));

        setSubtitles([]);
        const isHdcx = typeof window !== 'undefined' && 
            (decodeURI(location.hash || '').includes('慧灯禅修课') || decodeURI(videoSrc || '').includes('慧灯禅修课') || decodeURI(src || '').includes('慧灯禅修课'));

        if (isHdcx) {
            setIsSubLoading(true);
            setSubFetchCompleted(false);
        } else {
            setIsSubLoading(false);
            setSubFetchCompleted(true);
        }
    }, [src, videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = ({ target: { currentTime } }) => {
            const subIndex = subtitles?.findIndex(
                sub => currentTime >= parseTime(sub?.startTime) && currentTime <= parseTime(sub?.endTime)
            );

            if (endTime && currentTime >= endTime) {
                video?.removeEventListener('timeupdate', handleTimeUpdate);
                if (setCurrent) setCurrent(prev => prev + 1);
            } else if (subIndex !== -1 && subIndex !== currentSubtitleIndex) {
                setCurrentSubtitleIndex(subIndex);

                if (playInfo.subAlignCenter && subtitles && subtitles.length - subIndex > 2) {
                    scrollSubtitleToView(subIndex);
                }
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [subtitles, currentSubtitleIndex, playInfo?.subAlignCenter, endTime, setCurrent]);

    const handleVideoEnd = () => {
        if (videoSrc !== 'blank' && setCurrent) {
            setCurrent(prev => prev + 1);
        }
    };

    const scrollSubtitleToView = (index) => {
        const el = document.getElementById(`subtitle-${index}`);
        const list = listRef.current;
        if (!el || !list) return;

        // 仅滚动字幕卡片内部容器，避免触发 iOS Safari 整页窗口抖动与滚动
        const elTop = el.offsetTop;
        const elHeight = el.offsetHeight;
        const listHeight = list.clientHeight / 2;
        const targetScrollTop = elTop - (listHeight / 3) + (elHeight / 3);

        list.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth',
        });
    };

    const handleSubtitleFetch = async (suburl, duration) => {
        setIsSubLoading(true);
        try {
            const subText = await fetchText(suburl);
            if (subText && subText.trim()) {
                const subtitlesArray = parseSubtitles(subText, duration, src);
                if (subtitlesArray && subtitlesArray.length > 0) {
                    setSubtitles(subtitlesArray);
                } else {
                    setSubtitles([]);
                }
            } else {
                setSubtitles([]);
            }
        } catch (e) {
            console.error('获取字幕失败', e);
            setSubtitles([]);
        } finally {
            setIsSubLoading(false);
            setSubFetchCompleted(true);
        }
    };

    const handleLoadedMetadata = (event) => {
        const { duration: videoDuration } = event?.target;
        if (videoSrc === 'blank') {
            videoRef?.current?.pause();
        }

        const isHdcx = typeof window !== 'undefined' && 
            (decodeURI(location.hash || '').includes('慧灯禅修课') || decodeURI(videoSrc || '').includes('慧灯禅修课') || decodeURI(src || '').includes('慧灯禅修课'));

        if (isHdcx) {
            const suburl = videoSrc?.replace('mp4', 'srt');
            handleSubtitleFetch(suburl, videoDuration);
        } else {
            setIsSubLoading(false);
            setSubFetchCompleted(true);
            setSubtitles([]);
        }

        if (videoDuration - endTime <= 1) {
            endTime = undefined;
        }
    };

    // 点击时间戳复制链接
    const handleCopyTimestamp = async (startTime, e) => {
        e.stopPropagation();
        const base = window.location.href.split('#t=')[0];
        const timeSec = parseTime(startTime);
        const link = `${base}#t=${timeSec}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success(`已复制定位时间: ${startTime?.split(',')[0]}`);
        } catch (err) {
            toast.error('复制失败，请手动复制');
        }
    };

    // 点击字幕行跳转时间
    const handleSubtitleClick = (startTime, index) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = parseTime(startTime);
        setCurrentSubtitleIndex(index);
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
                                onPause={() => setPlayInfo(prev => ({ ...prev, paused: true }))}
                                onPlay={() => setPlayInfo(prev => ({ ...prev, paused: false }))}
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
                                onPause={() => setPlayInfo(prev => ({ ...prev, paused: true }))}
                                onPlay={() => setPlayInfo(prev => ({ ...prev, paused: false }))}
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
                            <div className={styles.transcriptTitle}>
                                <svg className={styles.transcriptIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    <line x1="9" y1="9" x2="15" y2="9" />
                                    <line x1="9" y1="13" x2="13" y2="13" />
                                </svg>
                                <span>同步字幕</span>
                                {isSubLoading ? (
                                    <span className={styles.transcriptLoadingTag}>加载中...</span>
                                ) : (
                                    subtitles.length > 0 && (
                                        <span className={styles.transcriptCount}>({subtitles.length}句)</span>
                                    )
                                )}
                            </div>

                            {/* 功能选项 */}
                            <div className={styles.transcriptActions}>
                                <button
                                    className={`${styles.pillToggle} ${isFullWidth ? styles.pillToggleActive : ''}`}
                                    onClick={() => setPlayInfo(prev => ({ ...prev, fullWidth: !prev.fullWidth }))}
                                    title={isFullWidth ? '恢复标准居中边距' : '开启充满屏幕（左侧视频右侧字幕无边距）'}
                                    aria-label={isFullWidth ? '恢复标准边距' : '充满屏幕'}
                                >
                                    <svg className={styles.pillIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        {isFullWidth ? (
                                            <>
                                                <polyline points="4 14 10 14 10 20" />
                                                <polyline points="20 10 14 10 14 4" />
                                                <line x1="14" y1="10" x2="21" y2="3" />
                                                <line x1="3" y1="21" x2="10" y2="14" />
                                            </>
                                        ) : (
                                            <>
                                                <polyline points="15 3 21 3 21 9" />
                                                <polyline points="9 21 3 21 3 15" />
                                                <line x1="21" y1="3" x2="14" y2="10" />
                                                <line x1="3" y1="21" x2="10" y2="14" />
                                            </>
                                        )}
                                    </svg>
                                    <span>{'宽屏'}</span>
                                </button>

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
                        <ul ref={listRef} className={styles.transcriptList}>
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
                                subtitles.map((sub, index) => {
                                    const isActive = index === currentSubtitleIndex;
                                    return (
                                        <li
                                            key={index}
                                            id={`subtitle-${index}`}
                                            className={`${styles.transcriptItem} ${isActive ? styles.activeItem : ''}`}
                                            onClick={() => handleSubtitleClick(sub.startTime, index)}
                                            title="点击跳转到该句播放"
                                        >
                                            {playInfo?.showTimeLine && (
                                                <span
                                                    className={styles.timeBadge}
                                                    onClick={(e) => handleCopyTimestamp(sub.startTime, e)}
                                                    title="点击复制此时间点链接"
                                                >
                                                    {sub.startTime?.split(',')[0]}
                                                </span>
                                            )}
                                            <p className={`${styles.transcriptText} ${isActive ? styles.activeText : ''}`}>
                                                {sub.text}
                                            </p>
                                        </li>
                                    );
                                })
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