import React, { useEffect } from 'react';
import { useLocation } from '@docusaurus/router';
import Playlist from '@site/src/components/Playlist'

export default function Root({ children }) {
    const location = useLocation();

    useEffect(() => {
        setTimeout(() => {
            if (/^\/(playlist|video)/.test(location.pathname)) {
                let footer = document.querySelector('footer')
                let main = document.querySelector('main')
                main.firstChild.removeAttribute('class')
                footer.style.display = 'none'
            }
        });
    }, [location]);
    return <>
        {children}
        <div style={{ display: location.pathname == '/playlist' ? 'block' : 'none' }}>
            <Playlist />
        </div>
    </>;
}