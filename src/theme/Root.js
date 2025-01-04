import React, { useEffect } from 'react';
import { useLocation } from '@docusaurus/router';
import Playlist from '@site/src/components/Playlist'
import { VideoProvider } from '../components/SubtitleContext/VideoContext';

export default function Root({ children }) {
    const location = useLocation();
    const shouldHide = /^\/(playlist|video)\/?/.test(location.pathname)
    const matchPlaylist = /^\/playlist\/?/.test(location.pathname)

    useEffect(() => {
        setTimeout(() => {
            let footer = document.querySelector('footer')
            if (shouldHide && footer.style.display != 'none') {
                footer.style.display = 'none'
                document.querySelector('main')?.removeAttribute('class')
            }
        }, 300);
    }, [location.pathname]);

    return (
        <VideoProvider>
            {children}
            <div style={{ display: matchPlaylist ? 'block' : 'none' }}>
                <Playlist />
            </div>
        </VideoProvider>);
}