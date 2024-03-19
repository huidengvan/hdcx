import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import SubtitleContext from '@site/src/components/SubtitleContext'
import styles from './playlist.module.css'
import { parseTime } from '../SubtitleContext';

export default function Playlist() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const urls = params.get('urls')?.split('|');
    const baseUrl = params.get('baseurl') || 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    const buildSrc = (url) => (url.includes('http') ? '' : baseUrl) + url.split('@')[0].replace('$', '#t=')

    const [src, setSrc] = useState()
    const [current, setCurrent] = useState(0)
    const [edit, setEdit] = useState(false)
    const [urltext, setUrltext] = useState(urls)
    useEffect(() => {
        if (urls?.length - current > 0) {
            setSrc(buildSrc(urls[current]))
        }

    }, [current])

    useEffect(() => {
        if (urls?.join() != urltext?.join()) {
            window.location.replace(`/playlist?urls=${urltext.join('|')}`)
        }
    }, [edit])

    const changeSrc = (e) => {
        const { value } = e.target
        setCurrent(value - 1)
    }

    const calcTime = () => {
        let t = 0
        urls?.forEach(item => {
            if (!item.includes('$')) {
                return t = 0
            }
            const times = item.split('$')[1].split('@')[0].split(',')
            t += (parseTime(times[1]) - parseTime(times[0]))
        })

        return (t / 60).toFixed(1);
    }

    return (
        <div className={styles.root}>
            {src && <SubtitleContext src={src} setCurrent={setCurrent} />}
            <details open>
                <summary style={{ userSelect: 'none',marginBottom:'5px' }}>播放列表
                    <span style={{
                        marginLeft: '4px'
                    }}
                        onClick={e => {
                            e.stopPropagation()
                            e.preventDefault()
                        }}

                    >
                        <span onClick={(e) => setEdit(prev => !prev)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z" />
                                <path fillRule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z" />
                            </svg>
                        </span>
                        <span style={{
                            marginLeft: '1rem',
                            fontSize: '12px'
                        }}>
                            {calcTime() > 0 && `时长：${calcTime()}分钟`}
                        </span>
                    </span>
                </summary>
                {edit ?
                    <textarea rows={5}
                    style={{padding: '.5rem'}}
                    placeholder='格式：视频地址$起始时间@列表显示名字 每个视频一行，编辑好再点一下铅笔图标。'
                        defaultValue={urltext?.join('\n')} className='col'
                        onChange={(e) => setUrltext(e.target.value?.split('\n').filter(item => item !== ''))}
                    /> :
                    <ol className={styles.playlist} >
                        {urls && urls[0] != '' &&
                            urls.map((url, index) => {
                                return (
                                    <li key={index} className={`${styles.item} ${current == index ? styles.active : ''}`} value={++index} onClick={changeSrc}>{decodeURI(url.split('@')[1] || url.split('.m')[0])}</li>
                                )
                            })
                        }
                    </ol>}
            </details>
        </div>
    )
}
