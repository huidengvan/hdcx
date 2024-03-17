import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import SubtitleContext from '.';
import styles from './playlist.module.css'

export default function Playlist() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const urls = params.get('urls')?.split('|');
    const baseUrl = params.get('baseurl') || 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    const buildSrc = (url) => (url.includes('http') ? '' : baseUrl) + url.replace('@', '#t=')

    const [src, setSrc] = useState()
    const [current, setCurrent] = useState(0)
    useEffect(() => {
        console.log(buildSrc(urls[current]),1);
        if (urls.length - current > 0) {
            setSrc(buildSrc(urls[current]))
        }

    }, [current])

    const changeSrc = (e) => {
        const { value } = e.target
        setCurrent(value - 1)
    }

    return (
        <div className={styles.root}>
            {src && <SubtitleContext src={src} setCurrent={setCurrent} />}
            <details>
                <summary>播放列表</summary>
                <ol className={styles.playlist} >
                    {urls && urls[0] != '' &&
                        urls.map((url, index) => {
                            return (
                                <li key={index} className={`${styles.item} ${current == index ? styles.active : ''}`} value={++index} onClick={changeSrc}>{decodeURI(url.split('.mp')[0])}</li>
                            )
                        })
                    }
                </ol>
            </details>
        </div>
    )
}
