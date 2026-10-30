import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useHistory } from '@docusaurus/router';
import toast from 'react-hot-toast';

const AudioContext = createContext(null);

export const AudioProvider = ({ children }) => {
    const history = useHistory();

    // 当前播放的音频元数据: { id, src, title, subtitle, duration, pagePath }
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

    // 页面内聚焦高亮状态与跨页面跳转待定位 Track ID
    const [focusedSectionId, setFocusedSectionId] = useState(null);
    const pendingFocusTrackIdRef = useRef(null);
    const focusTimerRef = useRef(null);

    // 真实全局唯一的 audio DOM 引用
    const audioRef = useRef(null);

    // 页面内所有注册的段落节点引用表 { [id]: HTMLElement }
    const registeredElementsRef = useRef(new Map());

    // 执行聚焦到播放器出现位置并播放光环动画
    const triggerFocusAnimation = useCallback((element, id) => {
        if (!element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFocusedSectionId(id);
        setIsDeckOpen(false);

        if (focusTimerRef.current) {
            clearTimeout(focusTimerRef.current);
        }
        focusTimerRef.current = setTimeout(() => {
            setFocusedSectionId((prev) => (prev === id ? null : prev));
            focusTimerRef.current = null;
        }, 2600);

        try {
            toast.success('已定位至音频播放位置', { id: 'audio-locate', duration: 1800 });
        } catch (e) {}
    }, []);

    // 注册段落 DOM（用于 IntersectionObserver 监听和平滑定位）
    const registerSection = useCallback((id, element) => {
        if (element) {
            registeredElementsRef.current.set(id, element);
            // 若刚刚跨页面跳转过来定位此音频组件
            if (pendingFocusTrackIdRef.current === id) {
                pendingFocusTrackIdRef.current = null;
                setTimeout(() => {
                    triggerFocusAnimation(element, id);
                }, 220);
            }
        } else {
            registeredElementsRef.current.delete(id);
        }
    }, [triggerFocusAnimation]);

    // 播放/切歌逻辑（单例保证绝对互斥）
    const playTrack = useCallback((track) => {
        const audio = audioRef.current;
        if (!audio || !track) return;

        if (currentTrack?.id === track.id) {
            // 同一个音频：恢复播放
            audio.play().catch(() => {});
            return;
        }

        // 切换新音频
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const trackWithPage = {
            ...track,
            pagePath: track.pagePath || currentPath,
        };

        setCurrentTrack(trackWithPage);
        setIsLoading(true);
        audio.src = trackWithPage.src;
        audio.playbackRate = playbackRate;
        audio.muted = isMuted;
        audio.currentTime = 0;
        audio.play().catch(() => {
            setIsLoading(false);
        });
    }, [currentTrack?.id, playbackRate, isMuted]);

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
        setFocusedSectionId(null);
        pendingFocusTrackIdRef.current = null;
        if (focusTimerRef.current) {
            clearTimeout(focusTimerRef.current);
            focusTimerRef.current = null;
        }
    }, []);

    const togglePlay = useCallback((track) => {
        if (!track) return;
        if (currentTrack?.id === track.id) {
            if (isPlaying) {
                pauseTrack();
            } else {
                audioRef.current?.play().catch(() => {});
            }
        } else {
            playTrack(track);
        }
    }, [currentTrack?.id, isPlaying, pauseTrack, playTrack]);


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

    // 平滑滚动定位回当前正在播放的文章段落并高亮聚焦
    const scrollToActiveSection = useCallback(() => {
        if (!currentTrack?.id) return;

        const targetId = currentTrack.id;
        const domId = `audio-section-${targetId}`;

        // 1. DOM 优先判定：若当前 DOM 树中已存在目标音频组件，直接就地定位与高亮
        const registeredEl = registeredElementsRef.current.get(targetId);
        const domEl = (registeredEl?.isConnected ? registeredEl : null)
            || (typeof document !== 'undefined' ? document.getElementById(domId) : null);

        if (domEl) {
            triggerFocusAnimation(domEl, targetId);
            return;
        }

        // 2. 跨页面判定：若 DOM 中未找到目标，且指定了不同页面的目标路径，通过路由跳转
        const targetPath = currentTrack.pagePath;
        const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const normalize = (p) => (p || '').replace(/\/+$/, '') || '/';
        const isDifferentPage = Boolean(targetPath && normalize(currentPath) !== normalize(targetPath));

        if (isDifferentPage) {
            pendingFocusTrackIdRef.current = targetId;
            setIsDeckOpen(false);
            const destination = `${targetPath}#${domId}`;
            if (history?.push) {
                history.push(destination);
            } else if (typeof window !== 'undefined') {
                window.location.href = destination;
            }
            return;
        }

        // 3. 同页面兜底重试（应对 DOM 仍在初次挂载微任务中的边缘情况）
        setTimeout(() => {
            const retryEl = document.getElementById(domId);
            if (retryEl) {
                triggerFocusAnimation(retryEl, targetId);
            }
        }, 120);
    }, [currentTrack, history, triggerFocusAnimation]);

    // 组件卸载时清理聚焦动画定时器
    useEffect(() => {
        return () => {
            if (focusTimerRef.current) {
                clearTimeout(focusTimerRef.current);
            }
        };
    }, []);

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
        if (!activeElem || !activeElem.isConnected) {
            // 当前页面不存在此音频卡片（例如处于跨文章浏览状态），悬浮条保持可见以供控制与一键回跳
            setIsMiniVisible(true);
            return;
        }

        if (typeof IntersectionObserver === 'undefined') return;

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
    }, [currentTrack?.id, history?.location?.pathname]);

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
        focusedSectionId,
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
            focusedSectionId: null,
        };
    }
    return context;
};
