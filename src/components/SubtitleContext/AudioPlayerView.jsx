import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    PlayIcon,
    PauseIcon,
    Rewind10Icon,
    Forward10Icon,
    VolumeIcon,
    MuteIcon,
} from '@site/src/components/AudioCompanion/Icons';
import styles from './index.module.css';

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0, 0.75];

export const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function AudioPlayerView({
    audioRef,
    src,
    coverSrc = 'https://hdcx.s3.ap-northeast-1.wasabisys.com/hdv/p/上师.jpg',
    onLoadedMetadata,
    onEnded,
    autoPlay,
    isFullWidth,
}) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [volume, setVolume] = useState(1.0);
    const [isMuted, setIsMuted] = useState(false);

    // 拖动进度条状态
    const [isDragging, setIsDragging] = useState(false);
    const [dragValue, setDragValue] = useState(0);

    // 悬浮时间提示
    const [hoverTime, setHoverTime] = useState(null);
    const [hoverX, setHoverX] = useState(0);

    useEffect(() => {
        const audio = audioRef?.current;
        if (!audio) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => {
            if (!isDragging) {
                setCurrentTime(audio.currentTime);
            }
        };
        const onDurationChange = () => {
            if (audio.duration && !isNaN(audio.duration)) {
                setDuration(audio.duration);
            }
        };
        const onLoaded = (e) => {
            if (audio.duration && !isNaN(audio.duration)) {
                setDuration(audio.duration);
            }
            setIsPlaying(!audio.paused);
            setPlaybackRate(audio.playbackRate || 1.0);
            setVolume(audio.volume);
            setIsMuted(audio.muted);
        };
        const onRateChange = () => {
            setPlaybackRate(audio.playbackRate);
        };
        const onVolumeChange = () => {
            setVolume(audio.volume);
            setIsMuted(audio.muted);
        };

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('ratechange', onRateChange);
        audio.addEventListener('volumechange', onVolumeChange);

        // 初始化
        if (audio.duration && !isNaN(audio.duration)) {
            setDuration(audio.duration);
        }
        setIsPlaying(!audio.paused);
        setCurrentTime(audio.currentTime);
        setPlaybackRate(audio.playbackRate || 1.0);
        setVolume(audio.volume);
        setIsMuted(audio.muted);

        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('ratechange', onRateChange);
            audio.removeEventListener('volumechange', onVolumeChange);
        };
    }, [src, audioRef, isDragging]);

    const togglePlay = useCallback(() => {
        const audio = audioRef?.current;
        if (!audio) return;
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
        }
    }, [audioRef]);

    const skip = useCallback((delta) => {
        const audio = audioRef?.current;
        if (!audio) return;
        const dur = audio.duration || 0;
        const target = Math.max(0, Math.min(dur, audio.currentTime + delta));
        audio.currentTime = target;
        setCurrentTime(target);
    }, [audioRef]);

    const handleNextRate = (e) => {
        e?.stopPropagation();
        const audio = audioRef?.current;
        if (!audio) return;
        const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
        const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
        const nextRate = SPEED_OPTIONS[nextIndex];
        audio.playbackRate = nextRate;
        setPlaybackRate(nextRate);
    };

    const toggleMute = (e) => {
        e?.stopPropagation();
        const audio = audioRef?.current;
        if (!audio) return;
        audio.muted = !audio.muted;
        setIsMuted(audio.muted);
    };

    const handleVolumeChange = (newVal) => {
        const audio = audioRef?.current;
        if (!audio) return;
        audio.volume = newVal;
        if (newVal > 0 && audio.muted) {
            audio.muted = false;
            setIsMuted(false);
        }
        setVolume(newVal);
    };

    const handleSeekChange = (e) => {
        const val = parseFloat(e.target.value);
        setDragValue(val);
    };

    const handleSeekStart = () => {
        setIsDragging(true);
        setDragValue(currentTime);
    };

    const handleSeekEnd = (e) => {
        setIsDragging(false);
        const val = parseFloat(e.target.value);
        const audio = audioRef?.current;
        if (audio) {
            audio.currentTime = val;
            setCurrentTime(val);
        }
    };

    // 全局抬起指针保护，防止拖动到进度条外部松开时漏掉 seek 提交
    useEffect(() => {
        if (!isDragging) return;
        const handleGlobalUp = () => {
            setIsDragging(false);
            const audio = audioRef?.current;
            if (audio) {
                audio.currentTime = dragValue;
                setCurrentTime(dragValue);
            }
        };
        window.addEventListener('pointerup', handleGlobalUp);
        window.addEventListener('mouseup', handleGlobalUp);
        window.addEventListener('touchend', handleGlobalUp);
        return () => {
            window.removeEventListener('pointerup', handleGlobalUp);
            window.removeEventListener('mouseup', handleGlobalUp);
            window.removeEventListener('touchend', handleGlobalUp);
        };
    }, [isDragging, dragValue, audioRef]);

    // 快捷键支持（空格播放/暂停，左右方向键快退/快进10秒）
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                skip(-10);
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                skip(10);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, skip]);

    const handleScrubberMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = rect.width > 0 ? x / rect.width : 0;
        setHoverTime(percent * (duration || 0));
        setHoverX(x);
    };

    const handleScrubberMouseLeave = () => {
        setHoverTime(null);
    };

    const displayTime = isDragging ? dragValue : currentTime;
    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;

    return (
        <div className={`${styles.audioWrapper} ${isFullWidth ? styles.audioWrapperFull : ''}`}>
            {/* 隐藏原生 controls 的原生 audio 元素，完全由 audioRef 与外部事件双向驱动 */}
            <audio
                ref={audioRef}
                src={src}
                onLoadedMetadata={onLoadedMetadata}
                onEnded={onEnded}
                autoPlay={autoPlay}
                playsInline
                webkit-playsinline="true"
                preload="metadata"
                style={{ display: 'none' }}
            />

            {/* 封面区域：居中、原比例不裁切四方形、高度顶满、微柔焦氛围衬底 */}
            <div className={styles.audioCoverContainer}>
                <div
                    className={styles.audioCoverBackdrop}
                    style={{ backgroundImage: `url(${coverSrc})` }}
                    aria-hidden="true"
                />
                <img
                    className={styles.audioCover}
                    src={coverSrc}
                    alt="音频封面"
                />
            </div>

            {/* 底部全宽播放器控制台：贴着下方放，宽度与左边分区相等 */}
            <div className={styles.audioCustomPlayer}>
                {/* 贴底/顶端的全宽无缝进度条 */}
                <div
                    className={styles.audioScrubberContainer}
                    onMouseMove={handleScrubberMouseMove}
                    onMouseLeave={handleScrubberMouseLeave}
                >
                    {hoverTime !== null && duration > 0 && (
                        <div
                            className={styles.audioScrubberTooltip}
                            style={{ left: `${hoverX}px` }}
                        >
                            {formatDuration(hoverTime)}
                        </div>
                    )}
                    <input
                        type="range"
                        className={styles.audioRangeInput}
                        min={0}
                        max={duration || 100}
                        step={0.1}
                        value={displayTime}
                        onPointerDown={handleSeekStart}
                        onPointerUp={handleSeekEnd}
                        onTouchStart={handleSeekStart}
                        onTouchEnd={handleSeekEnd}
                        onMouseDown={handleSeekStart}
                        onMouseUp={handleSeekEnd}
                        onChange={handleSeekChange}
                        style={{
                            background: `linear-gradient(to right, var(--ifm-color-primary, #2e8555) ${progressPercent}%, rgba(255, 255, 255, 0.16) ${progressPercent}%)`,
                        }}
                        aria-label="音频播放进度"
                    />
                </div>

                {/* 控制按钮与信息行 */}
                <div className={styles.audioControlsRow}>
                    <div className={styles.audioControlsLeft}>
                        <button
                            type="button"
                            className={styles.audioPlayBtn}
                            onClick={togglePlay}
                            title={isPlaying ? '暂停 (空格键)' : '播放 (空格键)'}
                            aria-label={isPlaying ? '暂停' : '播放'}
                        >
                            {isPlaying ? (
                                <PauseIcon size={20} fill="#ffffff" />
                            ) : (
                                <PlayIcon size={20} fill="#ffffff" />
                            )}
                        </button>
                        <button
                            type="button"
                            className={styles.audioIconBtn}
                            onClick={() => skip(-10)}
                            title="后退 10 秒 (← 键)"
                            aria-label="后退 10 秒"
                        >
                            <Rewind10Icon size={22} />
                        </button>
                        <button
                            type="button"
                            className={styles.audioIconBtn}
                            onClick={() => skip(10)}
                            title="前进 10 秒 (→ 键)"
                            aria-label="前进 10 秒"
                        >
                            <Forward10Icon size={22} />
                        </button>
                        <div className={styles.audioTimeText}>
                            <span>{formatDuration(displayTime)}</span>
                            <span className={styles.audioTimeDivider}>/</span>
                            <span>{formatDuration(duration)}</span>
                        </div>
                    </div>

                    <div className={styles.audioControlsRight}>
                        <button
                            type="button"
                            className={styles.audioRateBtn}
                            onClick={handleNextRate}
                            title="切换播放倍速"
                            aria-label="切换播放倍速"
                        >
                            {playbackRate}x
                        </button>
                        <div className={styles.audioVolumeGroup}>
                            <button
                                type="button"
                                className={styles.audioIconBtn}
                                onClick={toggleMute}
                                title={isMuted ? '取消静音' : '静音'}
                                aria-label={isMuted ? '取消静音' : '静音'}
                            >
                                {isMuted || volume === 0 ? <MuteIcon size={20} /> : <VolumeIcon size={20} />}
                            </button>
                            <input
                                type="range"
                                className={styles.audioVolumeInput}
                                min={0}
                                max={1}
                                step={0.05}
                                value={isMuted ? 0 : volume}
                                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                title={`音量: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                                style={{
                                    background: `linear-gradient(to right, var(--ifm-color-primary, #2e8555) ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.2) ${(isMuted ? 0 : volume) * 100}%)`,
                                }}
                                aria-label="音量调节"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
