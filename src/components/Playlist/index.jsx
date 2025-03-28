import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import SubtitleContext from '@site/src/components/SubtitleContext'
import styles from './playlist.module.css'
import { parseTime } from '@site/src/utils'
import useLocalStorageState from 'use-local-storage-state'

export default function Playlist() {
    const location = useLocation();
    if (/^\/video\/?/.test(location.pathname)) return;
    const params = new URLSearchParams(location.search);
    const urlsParam = params.get('urls');
    const uriParam = params.get('uri'); // 可以传入一个列表文件
    const currentParam = params.get('index');
    let urls = urlsParam?.split('|');
    const [current, setCurrent] = useState(currentParam || 0)

    const [edit, setEdit] = useState(false)
    const [urltext, setUrltext] = useLocalStorageState('playlist', { defaultValue: urls })

    const parseUri = async () => {
        let res = await fetchTextFile(uriParam);
        urls = res?.split(/\r?\n/)
        setUrltext(urls)
    }
    const buildSrc = (url) => url.split('@')[0].replace('^', '#t=')

    useEffect(() => {
        if (urls?.length > 0 && urltext?.join() != urls?.join()) {
            setUrltext(urls)
        } else if (!urlsParam && uriParam) {
            parseUri()
        }
    }, [])

    const changeSrc = (e) => {
        const { value } = e.target
        setCurrent(value - 1)
    }

    return (
        <>
            <div className={styles.root}>
                {urltext?.length > current && <SubtitleContext src={buildSrc(urltext[current])} current={current} setCurrent={setCurrent} />}
                <details open className={styles.details}>
                    <summary style={{ userSelect: 'none', marginBottom: '5px' }}>播放列表
                        <span style={{ marginLeft: '4px' }}
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
                            <Duration urltext={urls || urltext} setUrltext={setUrltext} />
                        </span>
                    </summary>
                    {edit ?
                        <textarea rows={10}
                            style={{ padding: '.5rem', width: '100%' }}
                            placeholder='格式：视频地址^起始时间@显示标题 每个视频一行，编辑好再点一下铅笔图标。'
                            defaultValue={urltext?.join('\n')} className='col'
                            onChange={(e) => setUrltext(e.target.value?.split('\n').filter(item => item !== ''))}
                        /> :
                        <ol className={styles.playlist} >
                            {urltext && urltext[0] != '' &&
                                urltext.map((url, index) => {
                                    return (
                                        <li key={index} className={`${styles.item} ${current == index ? styles.active : ''}`} value={++index} onClick={changeSrc}>{decodeURI(url.split('@')[1] || url.split('/')[url.split('/')?.length - 1])?.split('.m')[0]}</li>
                                    )
                                })
                            }
                        </ol>}
                </details>
            </div>
            <div className={styles.footer}>
                <img src="https://box.hdcxb.net/d/%E5%85%B6%E4%BB%96%E8%B5%84%E6%96%99/p/bajixiang.jpg" alt="供八吉祥" />
            </div>
        </>
    )
}

const Duration = ({ urltext, setUrltext }) => {
    const [totalDuration, setTotalDuration] = useState('');
    let videoUrls = urltext;
    let urlsLength = urltext?.length;
    const calculateTotalDuration = async () => {
        let t = 0
        let matchRxl
        for (let i = 0; i < videoUrls?.length; i++) {
            const item = videoUrls[i];

            if (!matchRxl) {
                matchRxl = item.includes('入行论辅导');
            }

            // 减去等候时播放恒常念诵原文的时间
            if (item.includes('五分钟')) {
                t -= 312
            }

            if (!item?.includes('^')) {
                // console.log('fetch video meta');
                let url = item?.split('@')[0];
                let duration = await getVideoDuration(url);
                if (duration > 0) {
                    t += duration;
                    videoUrls[i] = `${item?.split('@')[0]}^0,${duration}${item?.split('@')?.length > 1 ? '@' + item?.split('@')[1] : ''}`
                }
            } else {
                const times = item.split('^')[1].split('@')[0].split(',');
                t += (parseTime(times[1]) - parseTime(times[0]));
            }
        }

        let duration = parseFloat((t / 3600).toFixed(2));
        let hour = parseInt(duration)
        let minute = Math.round((duration - hour) * 60)
        if (duration > 0) {
            setTotalDuration(`时长：${hour ? hour + '小时' : ''}${minute ? minute + '分钟' : ''}`)
        }
        if (urlsLength != videoUrls?.length) {
            setUrltext(videoUrls)
        }
        // console.log(`--计算列表时长-- ${duration}小时, 列表长度：${videoUrls?.length}`);
    };

    useEffect(() => {
        calculateTotalDuration();
    }, []);

    return (
        <>
            {totalDuration &&
                <span style={{ marginLeft: '1rem', fontSize: '12px' }}>
                    {totalDuration}
                </span>}
        </>
    );
};

export async function getVideoDuration(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata'; // 只加载元数据
        video.src = videoUrl;
        video.onloadedmetadata = () => {
            resolve(Math.floor(video.duration)); // 获取视频时长
            video.pause(); // 可选：暂停视频
            video.src = ''; // 释放资源
        };

        video.onerror = () => {
            // console.warn(`无法加载视频: ${videoUrl}`);
            resolve(0)
        };
    });
}

async function fetchTextFile(uri) {
    try {
        const response = await fetch(uri);

        if (!response.ok) {
            throw new Error('Network response was not ok ' + response.statusText);
        }

        return await response.text();
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
    }
}
