import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useLocation } from '@docusaurus/router';
import { Toaster } from 'react-hot-toast';
import { VideoProvider } from '../components/SubtitleContext/VideoContext';
import { AudioProvider, FloatingPodcastPlayer } from '../components/AudioCompanion';

// 播放列表连同字幕播放器单独打包，第一次进 /playlist 时才下载，其他页面不带这部分代码
const Playlist = lazy(() => import('@site/src/components/Playlist'));

const VALID_THEMES = ['white', 'warm', 'green', 'maroon'];

export default function Root({ children }) {
    const location = useLocation();
    // /video 页自己不渲染页脚（VideoPage.jsx），这里只处理 /playlist
    const shouldHide = /^\/playlist\/?/.test(location.pathname);
    const matchPlaylist = /^\/playlist\/?/.test(location.pathname);

    // 进过 /playlist 之后一直保持挂载（离开时只是隐藏），和原来一样不打断正在播放的内容
    const [playlistLoaded, setPlaylistLoaded] = useState(false);
    useEffect(() => {
        if (matchPlaylist) setPlaylistLoaded(true);
    }, [matchPlaylist]);

    useEffect(() => {
        setTimeout(() => {
            let footer = document.querySelector('footer');
            if (shouldHide && footer && footer.style.display !== 'none') {
                footer.style.display = 'none';
                document.querySelector('main')?.removeAttribute('class');
            }
        }, 300);
    }, [location.pathname, shouldHide]);

    // 全局同步与初始化阅读主题，确保导航栏、卡片、底部及全文样式在所有页面保持一致
    useEffect(() => {
        try {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.setAttribute('data-reader-theme', 'white');
            } else {
                let savedTheme = localStorage.getItem('readerTheme') || 'white';
                if (savedTheme === 'yellow') savedTheme = 'maroon';
                const safeTheme = VALID_THEMES.includes(savedTheme) ? savedTheme : 'white';
                document.documentElement.setAttribute('data-reader-theme', safeTheme);
            }
        } catch (e) {}

        // 监听 data-theme 属性变化（如系统/快捷键切换夜间模式）
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    if (isDark) {
                        document.documentElement.setAttribute('data-reader-theme', 'white');
                        try {
                            localStorage.setItem('readerTheme', 'white');
                            localStorage.setItem('readerThemeIndex', '0');
                        } catch (e) {}
                    }
                }
            }
        });

        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    return (
        <VideoProvider>
            <AudioProvider>
                {children}
                {playlistLoaded && (
                    <div style={{ display: matchPlaylist ? 'block' : 'none' }}>
                        <Suspense fallback={null}>
                            <Playlist />
                        </Suspense>
                    </div>
                )}
                <FloatingPodcastPlayer />
                <Toaster position="top-center" containerStyle={{ zIndex: 99999 }} />
            </AudioProvider>
        </VideoProvider>
    );
}