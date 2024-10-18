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

function formatTimeToLRC(currentTime) {
    // 将当前时间转换为分钟和秒
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60);
    const milliseconds = Math.floor((currentTime % 1) * 100); // 提取毫秒部分并转换为整数

    // 格式化为 [mm:ss.ms] 形式
    const formattedTime = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}]`;

    return formattedTime;
}

const VideoPlayer = ({ src, setCurrent, subPath, subType }) => {
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    let videoSrc = src || `${baseUrl}${location.hash.slice(1)}`;
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [showtime, setShowtime] = useState(localStorage.getItem('showtime') !== 'false');
    const videoRef = useRef(null);
    const subRef = useRef(null);
    const ulRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])

    const copyText = async (text) => {
        const msgEl = document.querySelector(`.${styles['subtitle-switch']}`);
        try {
            await navigator.clipboard.writeText(text);
            console.log('文本已复制到剪贴板');
            msgEl?.classList.add(`${styles['show-copied']}`);
            setTimeout(() => msgEl?.classList.remove(`${styles['show-copied']}`), 1000)
            return true;
        } catch (err) {
            console.error('复制失败:', err);
            return false;
        }
    }
    const subFullscreen = () => {
        if (!document.fullscreenElement) {
            ulRef.current.style.overflowY = 'hidden'
            subRef.current.requestFullscreen()
        } else {
            ulRef.current.style.overflowY = 'auto'
            document.exitFullscreen()
        }
    }

    const parseSubtitles = (data) => {
        const subtitlesArray = [];
        if (subType == 'lrc') {
            const subtitleLines = data.trim()?.split(new RegExp('\r?\n'));
            subtitleLines.forEach((line) => {
                const match = line.match(/\[(\d{1,2}):(\d{2})(?::(\d+\.\d+))?\](.*)/);
                if (match) {
                    const hours = match[1] || '00'; // 小时
                    const minutes = match[2]; // 分钟
                    const seconds = match[3] || '00.00'; // 秒（如果没有则默认）
                    const startTime = `${hours}:${minutes}:${seconds}`;
                    const text = match[4].trim(); // 获取字幕文本
                    subtitlesArray.push({ startTime, endTime: '', text });
                }
            });
        } else {
            const subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));
            subtitleLines.forEach((line) => {
                const parts = line.trim()?.split(new RegExp('\r?\n'));
                const index = parts[0];
                const time = parts[1]?.split(' --> ');
                const text = parts.slice(2).join('\n');
                subtitlesArray.push({ index, startTime: time[0], endTime: time[1], text });
            });
        }

        setSubtitles(subtitlesArray);
    };

    useEffect(() => {
        // 清除栅格布局, 使宽度为100%
        document.querySelector('main').firstChild.removeAttribute('class')
        document.querySelector('article').parentElement.removeAttribute('class')
        document.querySelector('footer').style.display = 'none'
        videoRef.current.src = videoSrc

        if (videoRef.current) {
            setTimeout(() => videoRef.current.play(), 1000)
        }
        let match = videoSrc.match(/入行论广解(\d+)课/);
        if (match) {
            // 打开新标签页
            const newTab = window.open(`/refs/rxl/fudao/rxl-fd01?autoPage=true#入菩萨行论第${parseInt(match[1])}节课`);
            // 关闭新标签页
            setTimeout(() => {
                newTab.close();
            }, endTime * 1000 / localStorage.getItem('playbackRate') || 1)
        }

        if (subPath || subType) {
            let videoPath = videoSrc.substring(0, videoSrc.lastIndexOf('/') + 1)
            let videoName = videoSrc.substring(videoSrc.lastIndexOf('/') + 1)
            let suburl = `${subPath || videoPath}${videoName.replace(/\.[^/.]+$/, '.' + (subType || 'srt'))}`
            // console.log(`fetch suxbtitle from ${suburl}`);
            fetch(suburl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.text();
                })
                .then(data => {
                    if (!data.includes('failed')) {
                        parseSubtitles(data)
                    }
                });
        }
        setSubtitles([])

    }, [src]);

    useEffect(() => {
        const video = videoRef.current;
        video.playbackRate = localStorage.getItem('playbackRate') || 1
        const handleTimeUpdate = () => {
            const currentTime = video?.currentTime;
            // console.log(currentTime, parseTime(subtitles[currentSubtitleIndex + 1]?.startTime));

            if (currentTime != null) {
                if (currentTime >= parseTime(subtitles[currentSubtitleIndex + 1]?.startTime)
                    && currentSubtitleIndex < subtitles.length - 1) {
                    setCurrentSubtitleIndex(currentSubtitleIndex + 1);
                    scrollSubtitleToView(currentSubtitleIndex);
                }

                // 当播放时间超过 endTime 时，切换到下一个视频
                // console.log(currentTime, endTime, video.duration)
                if (currentTime >= (endTime || video.duration) - 1) {
                    // 执行切换到下一个视频的操作
                    setCurrent(prev => prev + 1)
                    // console.log("Switching to next video");
                    endTime = undefined
                }
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'p' || event.key === 'P') {
                if (videoRef.current.paused)
                    videoRef.current.play()
                else
                    videoRef.current.pause();
            } else if (event.key === 't' || event.key === 'T') {
                subFullscreen()
            } else if (event.key === 'm' || event.key === 'M') {
                copyText('\n' + formatTimeToLRC(video?.currentTime)) // 复制时间点
            } else if (event.key === 'ArrowLeft') { // 左箭头
                ulRef.current.scrollBy(0, 30 - window.innerHeight);
            } else if (event.key === 'ArrowRight') { // 右箭头
                ulRef.current.scrollBy(0, window.innerHeight - 30);
            } else if (event.key === 'ArrowUp') {
                video.currentTime = Math.max(0, videoRef.current.currentTime - 10);  // 上箭头后退10s
            } else if (event.key === 'ArrowDown') {
                videoRef.current.currentTime += 30; // 下箭头前进30s
            } else if (event.key === '1') {
                videoRef.current.playbackRate = 1
                localStorage.setItem('playbackRate', 1)
            } else if (event.key === '2') {
                videoRef.current.playbackRate = 2
                localStorage.setItem('playbackRate', 2)
            } else if (event.key === 'j' && currentSubtitleIndex < subtitles.length - 1) {
                setCurrentSubtitleIndex(currentSubtitleIndex + 1)
                videoRef.current.currentTime = parseTime(subtitles[currentSubtitleIndex + 1].startTime)
            } else if (event.key === 'k' && currentSubtitleIndex > 0) {
                setCurrentSubtitleIndex(currentSubtitleIndex - 1)
                videoRef.current.currentTime = parseTime(subtitles[currentSubtitleIndex - 1].startTime)
            }
        };

        // 添加事件监听器
        window.addEventListener('keydown', handleKeyDown);
        video?.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video?.removeEventListener('timeupdate', handleTimeUpdate);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [subtitles, currentSubtitleIndex]);


    const scrollSubtitleToView = (index) => {
        const subtitleElement = document.getElementById(`subtitle-${index}`);
        const parentElement = ulRef.current;

        if (parentElement) {
            parentElement.scroll({
                behavior: 'auto',
                top: subtitleElement?.offsetTop - (parentElement?.clientHeight - subtitleElement?.clientHeight) / 2
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
                <div className={`${styles['subtitle-box']} ${styles.item}`} ref={subRef}>
                    <ul ref={ulRef} onDoubleClick={subFullscreen}>
                        <span className={styles['subtitle-switch']}>
                            <input type="checkbox"
                                checked={showtime}
                                onChange={() => {
                                    localStorage.setItem('showtime', !showtime)
                                    setShowtime(value => !value)
                                }} />
                            <span>显示时间</span>
                            <button onClick={subFullscreen}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5M.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5" />
                                </svg>
                            </button>
                        </span>
                        {subtitles.map((subtitle, index) => (
                            <li key={index} id={`subtitle-${index}`} className={styles['subtitle-line']}>
                                {showtime && <span title='点击复制' className={styles.timeline}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyText(`${window.location.href.split('#t=')[0]}#t=${parseTime(subtitle.startTime)}`)
                                    }}
                                >{subtitle.startTime?.split(',')[0]}</span>}
                                <span className={`${index === currentSubtitleIndex ? styles['current-line'] : ''}`}
                                    onClick={() => {
                                        videoRef.current.currentTime = parseTime(subtitle.startTime)
                                        const subtitleIndex = subtitles.findLastIndex(subtitle => videoRef.current?.currentTime > parseTime(subtitle.startTime))
                                        setCurrentSubtitleIndex(subtitleIndex)
                                    }}>
                                    {subtitle.text}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>}
        </div >
    );
};



export default function SubtitleContext(props) {
    return (
        <BrowserOnly>
            {() => (location.hash || props.src) && <VideoPlayer {...props} />}
        </BrowserOnly>
    );
};
