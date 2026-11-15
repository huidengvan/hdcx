import React, { useState, useRef, useEffect } from 'react';
import { useAudioCompanion } from './AudioContext';
import { VideoPlayIcon, PauseIcon, PlayIcon, CloseIcon } from './Icons';
import styles from './audioCompanion.module.css';

/**
 * 文章段落视频伴读卡片组件
 * 风格与 SectionAudio 音频伴读卡片完全一致，Icon 换成视频播放图标。
 * 点击时直接在当前页面内展开播放该视频。
 */
export default function SectionVideo({
  id,
  src,
  title = '课程视频',
  subtitle = '慈诚罗珠堪布 • 课程视频',
  poster,
  warning,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const cardRef = useRef(null);
  const trackId = id || src || title;

  const audioContext = useAudioCompanion();

  // 判断是否带有密法警告
  const secretWarning = warning || (() => {
    try {
      const decoded = decodeURIComponent(src || '');
      if (decoded.includes('必须有四级灌顶才可以观看')) {
        return '必须有四级灌顶才可以观看';
      }
      if (decoded.includes('灌顶') || decoded.includes('密法')) {
        return '须得受过密法灌顶方可观看';
      }
    } catch (e) {}
    return null;
  })();

  // 点击展开并在页面内播放视频
  const handleOpenPlay = (e) => {
    e?.stopPropagation();
    // 如果当前有音频伴读在播放，则暂停音频避免同时发声
    if (audioContext?.isPlaying) {
      audioContext.togglePlay(audioContext.currentTrack);
    }
    setIsOpen(true);
  };

  // 当 isOpen 变为 true 时自动播放视频
  useEffect(() => {
    if (isOpen && videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('视频自动播放被浏览器拦截:', e);
      });
    }
  }, [isOpen]);

  // 关闭视频
  const handleClose = (e) => {
    e?.stopPropagation();
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setIsOpen(false);
  };

  return (
    <div
      ref={cardRef}
      id={`video-section-${trackId}`}
      className={`${styles.sectionCard} ${isOpen ? styles.active : styles.videoCard}`}
      onClick={!isOpen ? handleOpenPlay : undefined}
    >
      {/* 展开播放时的视频播放容器 */}
      {isOpen && (
        <>
          {secretWarning && (
            <div className={styles.secretDharmaBanner}>
              <span>⚠️</span>
              <strong>密法警告：</strong>
              <span>{secretWarning}</span>
            </div>
          )}
          <div className={styles.videoWrapper}>
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              controls
              playsInline
              className={styles.videoElement}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>
        </>
      )}

      {/* 卡片主信息行 */}
      <div className={styles.cardMainRow}>
        {/* 单一主控制圆形播放按钮 */}
        <button
          type="button"
          className={`${styles.playControlBtn} ${isPlaying ? styles.isPlaying : ''}`}
          onClick={isOpen ? (isPlaying ? () => videoRef.current?.pause() : () => videoRef.current?.play()) : handleOpenPlay}
          title={isOpen ? (isPlaying ? '暂停' : '播放视频') : '在页面内播放视频'}
          aria-label={isOpen ? (isPlaying ? '暂停' : '播放视频') : '在页面内播放视频'}
        >
          {isOpen ? (
            isPlaying ? (
              <PauseIcon size={20} fill="#ffffff" />
            ) : (
              <PlayIcon size={20} fill="#ffffff" />
            )
          ) : (
            <VideoPlayIcon size={20} fill="#ffffff" />
          )}
        </button>

        {/* 标题与副标题元信息 */}
        <div className={styles.metaInfo}>
          <div className={styles.titleRow}>
            <span className={styles.cardTitle} title={title}>{title}</span>
            {secretWarning && (
              <span className={styles.warningPill} title={`密法警告：${secretWarning}`}>
                ⚠️ {secretWarning}
              </span>
            )}
          </div>
          <div className={styles.cardSubtitle}>
            <span>{subtitle}</span>
          </div>
        </div>

        {/* 右侧动作按钮 */}
        <div className={styles.cardActions}>
          {isOpen ? (
            <button
              type="button"
              className={styles.collapseVideoBtn}
              onClick={handleClose}
              title="关闭视频播放器"
              aria-label="关闭视频播放器"
            >
              <CloseIcon size={14} />
              <span>关闭视频</span>
            </button>
          ) : (
            <span className={styles.videoBadge}>
              <VideoPlayIcon size={14} />
              <span>点击播放</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
