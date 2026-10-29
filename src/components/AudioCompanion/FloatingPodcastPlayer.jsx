import React, { useRef, useEffect } from 'react';
import { useAudioCompanion } from './AudioContext';
import {
  PlayIcon,
  PauseIcon,
  Rewind10Icon,
  Forward10Icon,
  VolumeIcon,
  MuteIcon,
  ChevronDownIcon,
  CloseIcon,
  Equalizer,
  formatTime,
} from './Icons';
import styles from './audioCompanion.module.css';

const SPEED_OPTIONS = [1.0, 1.25, 1.5, 2.0, 0.75];

/**
 * 悬浮播客伴读控制器
 * 收到侧边时贴在右边缘，仅露出一半并呈半透明状态（与主题调节 A 按钮风格一致），完全不遮挡阅读
 * 点击可呼出全功能紧凑控制面板
 */
export default function FloatingPodcastPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isMuted,
    isMiniVisible,
    isDeckOpen,
    setIsDeckOpen,
    togglePlay,
    closeCompanion,
    seek,
    skip,
    changePlaybackRate,
    toggleMute,
  } = useAudioCompanion();

  const deckRef = useRef(null);
  const orbRef = useRef(null);

  // 当点击外部区域时，自动收起展开的播客大控制台（保留侧边半露悬浮球）
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (isDeckOpen && deckRef.current && !deckRef.current.contains(e.target)) {
        if (orbRef.current && orbRef.current.contains(e.target)) return;
        setIsDeckOpen(false);
      }
    };

    if (isDeckOpen) {
      document.addEventListener('pointerdown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [isDeckOpen, setIsDeckOpen]);

  if (!currentTrack || (!isMiniVisible && !isDeckOpen)) {
    return null;
  }

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  // 悬浮侧边按钮的进度填充：每 3 秒离散更新一次，避免过于频繁跳动，平滑覆盖背景
  const orbProgressPercent = duration > 0 ? Math.min(100, Math.max(0, (Math.floor(currentTime / 3) * 3 / duration) * 100)) : 0;

  // 循环切换倍速
  const handleNextRate = (e) => {
    e?.stopPropagation();
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    changePlaybackRate(SPEED_OPTIONS[nextIndex]);
  };

  return (
    <div className={styles.floatingWrapper} aria-label="文章音频伴读悬浮控制器">
      {/* 呼出的全功能播客控制台 (紧凑简洁版) */}
      {isDeckOpen && (
        <div ref={deckRef} className={styles.podcastDeck}>
          {/* 面板头部：左侧分类与标题，右侧集成倍速、静音与收起按钮 */}
          <div className={styles.deckHeader}>
            <div className={styles.deckHeaderMeta}>
              <span className={styles.deckCategory}>
                {currentTrack.subtitle || '文章有声伴读'}
              </span>
              <h5 className={styles.deckTitle} title={currentTrack.title}>
                {currentTrack.title}
              </h5>
            </div>
            <div className={styles.deckHeaderTools}>
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
                className={styles.muteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                title={isMuted ? '取消静音' : '静音'}
                aria-label={isMuted ? '取消静音' : '静音'}
              >
                {isMuted ? <MuteIcon size={18} /> : <VolumeIcon size={18} />}
              </button>

              {isPlaying ? (
                <button
                  type="button"
                  className={styles.closeDeckBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeckOpen(false);
                  }}
                  title="收起到侧边悬浮球"
                  aria-label="收起面板"
                >
                  <ChevronDownIcon size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.closeDeckBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeCompanion();
                  }}
                  title="关闭音频伴读"
                  aria-label="关闭音频伴读"
                >
                  <CloseIcon size={18} />
                </button>
              )}
            </div>
          </div>

          {/* 进度控制滑块 */}
          <div className={styles.scrubberWrapper}>
            <input
              type="range"
              className={styles.rangeInput}
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, var(--ifm-color-primary) ${progressPercent}%, rgba(125, 125, 125, 0.2) ${progressPercent}%)`,
              }}
            />
            <div className={styles.timeRow}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* 核心主控制区 (比例均衡协调，统一为 10 秒) */}
          <div className={styles.deckMainControls}>
            <button
              type="button"
              className={styles.skipBtn}
              onClick={() => skip(-10)}
              title="后退 10 秒"
              aria-label="后退 10 秒"
            >
              <Rewind10Icon size={24} />
            </button>

            <button
              type="button"
              className={styles.deckPlayBtn}
              onClick={() => togglePlay(currentTrack)}
              title={isPlaying ? '暂停' : '播放'}
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <PauseIcon size={22} fill="#ffffff" />
              ) : (
                <PlayIcon size={22} fill="#ffffff" />
              )}
            </button>

            <button
              type="button"
              className={styles.skipBtn}
              onClick={() => skip(10)}
              title="前进 10 秒"
              aria-label="前进 10 秒"
            >
              <Forward10Icon size={24} />
            </button>
          </div>
        </div>
      )}

      {/* 吸附在右边缘的半露悬浮播放球/把手 (匹配主题调节 A 按钮风格) */}
      <div
        ref={orbRef}
        id="audio-floating-orb"
        className={`${styles.floatingOrb} ${isPlaying ? styles.orbPlaying : ''} ${isDeckOpen ? styles.orbActive : ''}`}
        onClick={() => setIsDeckOpen((prev) => !prev)}
        title={isDeckOpen ? '收起播放面板' : `展开播放器: ${currentTrack.title}`}
        aria-label="音频伴读悬浮球"
      >
        {/* 从左向右覆盖背景的进度填充层 */}
        <div
          className={styles.orbProgressFill}
          style={{ width: `${orbProgressPercent}%` }}
        />

        {/* 状态内容：播放中展示跳动均衡器，暂停展示播放按钮 */}
        <div className={styles.orbCenter}>
          {isPlaying ? (
            <Equalizer isPlaying={true} />
          ) : (
            <PlayIcon size={14} fill="currentColor" />
          )}
        </div>
      </div>
    </div>
  );
}
