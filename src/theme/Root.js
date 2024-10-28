import React, { useEffect } from 'react';
import { useLocation } from '@docusaurus/router';
import Playlist from '@site/src/components/Playlist'

export default function Root({ children }) {
    const location = useLocation();
    const matchPath = /^\/playlist\/?/.test(location.pathname)
    useEffect(() => {
        let shouldHide = /^\/(playlist|video)\/?/.test(location.pathname)

        if (shouldHide) {
            let footer = document.querySelector('footer')
            document.querySelector('main')?.firstChild.removeAttribute('class')
            footer.style.display = 'none'

        }

        setTimeout(() => {
            let footer = document.querySelector('footer')
            if (shouldHide && footer.style.display != 'none') {
                footer.style.display = 'none'
            }
        });
    }, [location]);

    return <>
        {children}
        <div style={{ display: matchPath ? 'block' : 'none' }}>
            <Playlist />
        </div>
    </>;
}