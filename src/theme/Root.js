import React, { useEffect } from 'react';
import { useLocation } from '@docusaurus/router';
import Playlist from '@site/src/components/Playlist'
import SubtitleContext from '@site/src/components/SubtitleContext'

const matchPlaylist = /^\/playlist\/?/.test(location.pathname)
const shouldHide = /^\/(playlist|video)\/?/.test(location.pathname)

export default function Root({ children }) {
    const location = useLocation();
    useEffect(() => {

        setTimeout(() => {
            let footer = document.querySelector('footer')
            if (shouldHide && footer.style.display != 'none') {
                footer.style.display = 'none'
                document.querySelector('main')?.removeAttribute('class')
            }
        }, 200);
    }, [location]);

    return (
        <>
            {children}
            <div style={{ display: shouldHide ? 'block' : 'none' }}>
                {matchPlaylist ? <Playlist /> : <SubtitleContext />}
            </div>
        </>);
}