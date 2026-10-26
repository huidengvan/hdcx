import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const AudioContext = createContext(null);

export const AudioProvider = ({ children }) => {
    // 当前播放的音频元数据: { id, src, title, subtitle, duration }
    const [currentTrack, setCurrentTrack] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [isMuted, setIsMuted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // 悬浮与面板控制状态
    const [isMiniVisible, setIsMiniVisible] = useState(false); // 是否由于离开可视区域而激活悬浮微缩条
    const [isDeckOpen, setIsDeckOpen] = useState(false);       // 是否呼出大播客控制面板

    // 真实全局唯一的 audio DOM 引用
    const audioRef = useRef(null);

    // 页面内所有注册的段落节点引用表 { [id]: HTMLElement }
    const registeredElementsRef = useRef(new Map());

    // 注册段落 DOM（用于 IntersectionObserver 监听和平滑定位）
    const registerSection = useCallback((id, element) => {
        if (element) {
            registeredElementsRef.current.set(id, element);
        } else {
            registeredElementsRef.current.delete(id);
        }
    }, []);

    // 播放/切歌逻辑（单例保证绝对互斥）
    const playTrack = useCallback((track) => {
        const audio = audioRef.current;
        if (!audio) return;

        if (currentTrack?.id === track.id) {
            // 同一个音频：恢复播放
            audio.play().catch(() => {});
        } else {
            // 切换新音频
            setCurrentTrack(track);
            setIsLoading(true);
            audio.src = track.src;
            audio.playbackRate = playbackRate;
            audio.muted = isMuted;
            audio.currentTime = 0;
            audio.play().catch(() => {
                setIsLoading(false);
            });
        }
    }, [currentTrack, playbackRate, isMuted]);

    const pauseTrack = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
        }
    }, []);

    // 关闭播放器并完全关闭悬浮组件
    const closeCompanion = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        setIsPlaying(false);
        setCurrentTrack(null);
        setIsMiniVisible(false);
        setIsDeckOpen(false);
        setCurrentTime(0);
        setDuration(0);
    }, []);

    const togglePlay = useCallback((track) => {
        if (currentTrack?.id === track.id) {
            if (isPlaying) {
                pauseTrack();
            } else {
                audioRef.current?.play().catch(() => {});
            }
        } else {
            playTrack(track);
        }
    }, [currentTrack, isPlaying, pauseTrack, playTrack]);

    // 跳转指定进度
    const seek = useCallback((time) => {
        const audio = audioRef.current;
        if (audio && !isNaN(time)) {
            const safeTime = Math.max(0, Math.min(time, duration || audio.duration || 0));
            audio.currentTime = safeTime;
            setCurrentTime(safeTime);
        }
    }, [duration]);

    // 快进 / 快退指定秒数 (如 ±15秒)
    const skip = useCallback((delta) => {
        const audio = audioRef.current;
        if (audio) {
            const newTime = (audio.currentTime || 0) + delta;
            seek(newTime);
        }
    }, [seek]);

    // 切换倍速
    const changePlaybackRate = useCallback((rate) => {
        setPlaybackRate(rate);
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
        }
    }, []);

    // 切换静音
    const toggleMute = useCallback(() => {
        setIsMuted((prev) => {
            const next = !prev;
            if (audioRef.current) {
                audioRef.current.muted = next;
            }
            return next;
        });
    }, []);

    // 平滑滚动定位回当前正在播放的文章段落
    const scrollToActiveSection = useCallback(() => {
        if (!currentTrack?.id) return;
        const targetElement = registeredElementsRef.current.get(currentTrack.id);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 定位回屏幕后，可以自动收起控制大面板
            setIsDeckOpen(false);
        }
    }, [currentTrack]);

    // 音频核心事件绑定
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onWaiting = () => setIsLoading(true);
        const onPlaying = () => setIsLoading(false);
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onLoadedMetadata = () => {
            setDuration(audio.duration || 0);
            setIsLoading(false);
        };
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onError = () => {
            setIsLoading(false);
            setIsPlaying(false);
        };

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('waiting', onWaiting);
        audio.addEventListener('playing', onPlaying);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('waiting', onWaiting);
            audio.removeEventListener('playing', onPlaying);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
        };
    }, []);

    // 视口监听：利用 IntersectionObserver 监听当前活跃段落是否滚出屏幕
    useEffect(() => {
        if (!currentTrack?.id) {
            setIsMiniVisible(false);
            return;
        }

        const activeElem = registeredElementsRef.current.get(currentTrack.id);
        if (!activeElem || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                // 如果当前正在播放的段落已经完全滚出视口，则自动呼出右下角悬浮条
                // 如果重新滚入可视区域，则自动收回悬浮条（在页面内即可看到完整卡片）
                const isOutOfView = !entry.isIntersecting;
                setIsMiniVisible(isOutOfView);
                if (!isOutOfView) {
                    setIsDeckOpen(false);
                }
            },
            {
                threshold: 0.1, // 只要露头 10% 就算在视口内
            }
        );

        observer.observe(activeElem);
        return () => observer.disconnect();
    }, [currentTrack?.id]);

    const value = {
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        isMuted,
        isLoading,
        isMiniVisible,
        setIsMiniVisible,
        isDeckOpen,
        setIsDeckOpen,
        playTrack,
        pauseTrack,
        togglePlay,
        closeCompanion,
        seek,
        skip,
        changePlaybackRate,
        toggleMute,
        registerSection,
        scrollToActiveSection,
    };

    return (
        <AudioContext.Provider value={value}>
            {children}
            {/* 全局单例隐藏 audio 标签 */}
            <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />
        </AudioContext.Provider>
    );
};

export const useAudioCompanion = () => {
    const context = useContext(AudioContext);
    if (!context) {
        return {
            currentTrack: null,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            playbackRate: 1.0,
            isMuted: false,
            isLoading: false,
            isMiniVisible: false,
            setIsMiniVisible: () => {},
            isDeckOpen: false,
            setIsDeckOpen: () => {},
            playTrack: () => {},
            pauseTrack: () => {},
            togglePlay: () => {},
            closeCompanion: () => {},
            seek: () => {},
            skip: () => {},
            changePlaybackRate: () => {},
            toggleMute: () => {},
            registerSection: () => {},
            scrollToActiveSection: () => {},
        };
    }
    return context;
};
