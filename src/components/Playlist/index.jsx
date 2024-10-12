import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import SubtitleContext from '@site/src/components/SubtitleContext'
import styles from './playlist.module.css'
import { parseTime } from '../SubtitleContext';

export default function Playlist() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const urls = params.get('urls')?.split('|');
    const buildSrc = (url) => url.split('@')[0].replace('^', '#t=')
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

    return (
        <div className={styles.root}>
            {src && <SubtitleContext src={src} setCurrent={setCurrent} />}
            <details open>
                <summary style={{ userSelect: 'none', marginBottom: '5px' }}>播放列表
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
                            {!urltext && ' 点击编辑'}
                        </span>
                        <Duration videoUrls={urls} />
                    </span>
                </summary>
                {edit ?
                    <textarea rows={5}
                        style={{ padding: '.5rem' }}
                        placeholder='格式：视频地址^起始时间@显示标题 每个视频一行，编辑好再点一下铅笔图标。'
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

async function getVideoDuration(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');

        video.preload = 'metadata'; // 只加载元数据
        video.src = videoUrl;

        video.onloadedmetadata = () => {
            resolve(video.duration); // 获取视频时长
            video.pause(); // 可选：暂停视频
            video.src = ''; // 释放资源
        };

        video.onerror = () => {
            reject(new Error('无法加载视频'));
        };
    });
}

const Duration = ({ videoUrls }) => {
    const [totalDuration, setTotalDuration] = useState('');

    useEffect(() => {
        const calculateTotalDuration = async () => {
            let t = 0
            for (const item of videoUrls) {
                if (!item?.includes('^')) {
                    let url = item?.split('@')[0];
                    let duration = await getVideoDuration(url);
                    t += Math.ceil(duration);
                } else {
                    const times = item.split('^')[1].split('@')[0].split(',');
                    t += (parseTime(times[1]) - parseTime(times[0]));
                }
            }

            t = (t / 60).toFixed(1);
            t >= 60 ?
                setTotalDuration(`${(t / 60).toFixed(1)}小时`) :
                setTotalDuration(`${t}分钟`)
        };

        calculateTotalDuration();
    }, [videoUrls]);

    return (
        <span style={{ marginLeft: '1rem', fontSize: '12px' }}>
            时长：{totalDuration}
        </span>
    );
};