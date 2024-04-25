import React, { useEffect, useState, useRef } from 'react';
import styles from './index.module.css';
import BrowserOnly from '@docusaurus/BrowserOnly';

export const parseTime = (timeString) => {
    if (!timeString) return timeString

    if (timeString?.split(':').length == 1) {
        return parseInt(timeString)
    }

    if (timeString?.split(':').length == 2) {
        timeString = '00:' + timeString
    }
    const parts = timeString?.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]?.replace(',', '.'));
    return hours * 3600 + minutes * 60 + (seconds || 0);
};

const VideoPlayer = ({ src, setCurrent }) => {
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    let videoSrc = src || `${baseUrl}${location.hash.slice(1)}`;
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [showtime, setShowtime] = useState(localStorage.getItem('showtime') !== 'false');
    const videoRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])

    useEffect(() => {
        // 清除栅格布局, 使宽度为100%
        document.querySelector('main').firstChild.removeAttribute('class')
        document.querySelector('article').parentElement.removeAttribute('class')
        document.querySelector('footer').style.display = 'none'
        fetch(`${videoSrc.replace(/m(?:p3|p4|4a)/, 'srt')}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(data => {
                if (!data.includes('failed')) {
                    parseSRT(data);
                }
            });

        const parseSRT = (data) => {
            const subtitlesArray = [];
            const subtitleLines = data.trim().split(new RegExp('\r?\n\r?\n'));
            subtitleLines.forEach((line) => {
                const parts = line.trim().split(new RegExp('\r?\n'));
                const index = parts[0];
                const time = parts[1].split(' --> ');
                const text = parts.slice(2).join('\n');
                subtitlesArray.push({ index, startTime: time[0], endTime: time[1], text });
            });
            setSubtitles(subtitlesArray);
        };

        const requestScreenWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    const wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Screen Wake Lock is active');

                    // 如果需要，在适当的时候释放屏幕常亮
                    // wakeLock.release();
                } catch (error) {
                    console.error('Error requesting Screen Wake Lock:', error);
                }
            }
        };

        requestScreenWakeLock();

    }, [videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        video.src = videoSrc

        const timer = setTimeout(() => video.play(), 1000)
        const handleTimeUpdate = () => {
            const currentTime = video?.currentTime;
            if (currentTime) {
                const currentSubtitleIndex = subtitles.findIndex(subtitle =>
                    currentTime >= parseTime(subtitle.startTime) && currentTime <= parseTime(subtitle.endTime)
                );
                if (currentSubtitleIndex !== -1) {
                    setCurrentSubtitleIndex(currentSubtitleIndex);
                    scrollSubtitleToView(currentSubtitleIndex);
                }

                // 当播放时间超过 endTime 时，切换到下一个视频
                if (currentTime > (endTime || video.duration - 1)) {
                    // 执行切换到下一个视频的操作
                    setCurrent(prev => prev + 1)
                    // console.log("Switching to next video");
                    endTime = undefined
                }
            }
        };
        video?.addEventListener('timeupdate', handleTimeUpdate);
        return () => {
            clearTimeout(timer)
            video?.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [src, subtitles]);

    const copyTextToClipboard = (text) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
    };

    const scrollSubtitleToView = (index) => {
        const subtitleElement = document.getElementById(`subtitle-${index}`);
        const parentElement = subtitleElement.parentElement;

        if (subtitleElement && parentElement) {
            parentElement.scroll({
                behavior: 'auto',
                top: subtitleElement.offsetTop - (parentElement.clientHeight - subtitleElement.clientHeight) / 2
            });
        }
    };


    return (
        <div className={styles['subtitle-container']}>
            <div className={styles.item}>
                <video ref={videoRef} width={'100%'} controls>
                    <source src={`${videoSrc}`} type="video/mp4" />
                </video>
            </div>
            {subtitles.length > 0 &&
                <div className={`${styles['subtitle-box']} ${styles.item}`}>
                    <ul onDoubleClick={() => {
                        videoRef.current?.paused ? videoRef.current.play() : videoRef?.current?.pause()
                    }}>
                        <label className={styles['subtitle-switch']}>
                            <input type="checkbox"
                                checked={showtime}
                                onChange={() => {
                                    localStorage.setItem('showtime', !showtime)
                                    setShowtime(value => !value)
                                }} />
                            <span> 显示时间</span>
                        </label>
                        {subtitles.map((subtitle, index) => (
                            <li key={index} id={`subtitle-${index}`} className={styles['subtitle-line']}>
                                {showtime && <span title='双击复制' className={styles.timeline}
                                    onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        const msgEl = document.querySelector(`.${styles['subtitle-switch']}`);
                                        let ok = copyTextToClipboard(`${window.location.href.split('#t=')[0]}#t=${parseTime(subtitle.startTime)}`);
                                        ok && msgEl?.classList.add(`${styles['show-copied']}`);
                                        setTimeout(() => msgEl?.classList.remove(`${styles['show-copied']}`), 1500)
                                    }}
                                >{subtitle.startTime.split(',')[0]}</span>}
                                <span className={`${styles['subtitle-text']} ${index === currentSubtitleIndex && styles['current-line']}`}
                                    title='双击暂停/播放'
                                    onClick={() => videoRef.current.currentTime = parseTime(subtitle.startTime)}>
                                    {subtitle.text}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>}
        </div>
    );
};



export default function SubtitleContext(props) {
    return (
        <BrowserOnly>
            {() => (location.hash || props.src) && <VideoPlayer {...props} />}
        </BrowserOnly>
    );
};

