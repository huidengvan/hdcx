import React, { useRef, useEffect } from 'react';
import { useAudioCompanion } from './AudioContext';
import {
  PlayIcon,
  PauseIcon,
  Rewind10Icon,
  Forward10Icon,
  VolumeIcon,
  MuteIcon,
  formatTime,
} from './Icons';
import styles from './audioCompanion.module.css';

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0, 0.75];

/**
 * 文章段落音频伴读卡片组件 (简洁优雅设计)
 * 点击直接播放，消除冗余双重播放按钮，支持后退30s与前进10s
 */
export default function SectionAudio({
  id,
  src,
  title = '文章音频伴读',
  subtitle = '有声书',
  duration: initialDuration,
}) {
  const cardRef = useRef(null);
  const trackId = id || src || title;

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isMuted,
    changePlaybackRate,
    toggleMute,
    togglePlay,
    skip,
    seek,
    registerSection,
  } = useAudioCompanion();

  // 循环切换倍速
  const handleNextRate = (e) => {
    e.stopPropagation();
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    changePlaybackRate(SPEED_OPTIONS[nextIndex]);
  };

  // 判断本组件是否是当前全局正在激活的音频
  const isCurrent = currentTrack?.id === trackId;
  const isCurrentlyPlaying = isCurrent && isPlaying;

  // 注册 DOM 引用，使全局 IntersectionObserver 可以感知此卡片是否在视口中
  useEffect(() => {
    if (cardRef.current) {
      registerSection(trackId, cardRef.current);
    }
    return () => {
      registerSection(trackId, null);
    };
  }, [trackId, registerSection]);

  const handleToggle = (e) => {
    e?.stopPropagation();
    togglePlay({
      id: trackId,
      src,
      title,
      subtitle,
      duration: initialDuration,
    });
  };

  const currentDuration = isCurrent ? duration : 0;
  const progressPercent = currentDuration > 0 ? (currentTime / currentDuration) * 100 : 0;

  return (
    <div
      ref={cardRef}
      id={`audio-section-${trackId}`}
      className={`${styles.sectionCard} ${isCurrent ? styles.active : ''}`}
    >
      <div className={styles.cardMainRow}>
        {/* 单一主控制圆形播放/暂停按钮 */}
        <button
          type="button"
          className={`${styles.playControlBtn} ${isCurrentlyPlaying ? styles.isPlaying : ''}`}
          onClick={handleToggle}
          title={isCurrentlyPlaying ? '暂停' : '播放音频'}
          aria-label={isCurrentlyPlaying ? '暂停' : '播放音频'}
        >
          {isCurrentlyPlaying ? (
            <PauseIcon size={20} fill="#ffffff" />
          ) : (
            <PlayIcon size={20} fill="#ffffff" />
          )}
        </button>

        {/* 标题与副标题元信息 */}
        <div className={styles.metaInfo}>
          <div className={styles.titleRow}>
            <span className={styles.cardTitle} title={title}>{title}</span>
          </div>
          <div className={styles.cardSubtitle}>
            <span>{subtitle}</span>
            {initialDuration && !isCurrent && <span>• {initialDuration}</span>}
          </div>
        </div>

        {/* 右侧控制项：激活时展示 快退10s / 快进10s / 倍速 / 静音，未激活时展示时长 */}
        {isCurrent ? (
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="后退 10 秒"
              onClick={() => skip(-10)}
              aria-label="后退 10 秒"
            >
              <Rewind10Icon size={22} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title="前进 10 秒"
              onClick={() => skip(10)}
              aria-label="前进 10 秒"
            >
              <Forward10Icon size={22} />
            </button>
            <button
              type="button"
              className={styles.ratePill}
              onClick={handleNextRate}
              title="切换收听倍速"
              aria-label="切换收听倍速"
            >
              {playbackRate}x
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={toggleMute}
              title={isMuted ? '取消静音' : '静音'}
              aria-label={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
            </button>
          </div>
        ) : (
          initialDuration && (
            <div className={styles.durationBadge}>
              {initialDuration}
            </div>
          )
        )}
      </div>

      {/* 激活状态下展开的内联简洁进度条 */}
      {isCurrent && (
        <div className={styles.inlineScrubberContainer}>
          <input
            type="range"
            className={styles.rangeInput}
            min={0}
            max={currentDuration || 100}
            step={0.5}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--ifm-color-primary) ${progressPercent}%, rgba(125, 125, 125, 0.2) ${progressPercent}%)`,
            }}
          />
          <div className={styles.timeRow}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(currentDuration)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
