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

const VideoPlayer = ({ src, setCurrent, subPath, subType }) => {
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    let videoSrc = src || `${baseUrl}${location.hash.slice(1)}`;
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [showtime, setShowtime] = useState(localStorage.getItem('showtime') !== 'false');
    const videoRef = useRef(null);
    const subRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])

    const editLrc = () => {
        if (!localStorage.getItem('boxToken')) {
            const password = prompt("请输入密码:");
            if (password) {
                fetch('https://box.hdcxb.net/api/auth/login', {
                    method: 'post',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        "username": "hdcx",
                        "password": password
                    })
                }).then(resp => resp.json())
                    .then(json => {
                        console.log(json);
                        localStorage.setItem('boxToken', resp.data?.token)
                    })
            }
        }


    }
    const subFullscreen = () => {
        if (subRef.current && !document.fullscreenElement) {
            subRef.current.requestFullscreen()
        } else {
            document.exitFullscreen()
        }
    }

    useEffect(() => {
        // 清除栅格布局, 使宽度为100%
        document.querySelector('main').firstChild.removeAttribute('class')
        document.querySelector('article').parentElement.removeAttribute('class')
        document.querySelector('footer').style.display = 'none'
        if (subPath || subType) {
            let videoPath = videoSrc.substring(0, videoSrc.lastIndexOf('/') + 1)
            let videoName = videoSrc.substring(videoSrc.lastIndexOf('/') + 1)
            let suburl = `${subPath || videoPath}${videoName.replace(/\.[^/.]+$/, '.' + (subType || 'lrc'))}`
            console.log(`fetch suxbtitle from ${suburl}`);

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

        const parseSubtitles = (data) => {
            const subtitlesArray = [];
            const subtitleLines = data.trim().split(new RegExp('\r?\n\r?\n'));
            if (subType == 'srt') {
                subtitleLines.forEach((line) => {
                    const parts = line.trim().split(new RegExp('\r?\n'));
                    const index = parts[0];
                    const time = parts[1].split(' --> ');
                    const text = parts.slice(2).join('\n');
                    subtitlesArray.push({ index, startTime: time[0], endTime: time[1], text });
                });
            } else {
                subtitleLines.forEach((line) => {
                    const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
                    if (match) {
                        const minutes = match[1];
                        const seconds = match[2];
                        const text = match[3].trim();
                        const startTime = `${minutes}:${seconds}`;
                        subtitlesArray.push({ startTime, endTime: '', text: line?.slice(10) });
                    }
                });
            }

            setSubtitles(subtitlesArray);
        };

    }, [videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        video.src = videoSrc

        const timer = setTimeout(() => video.play(), 1000)
        const handleTimeUpdate = () => {
            const currentTime = video?.currentTime;
            if (currentTime) {
                const currentSubtitleIndex = subtitles.findIndex(subtitle =>
                    currentTime >= parseTime(subtitle.startTime)
                    //  && currentTime <= parseTime(subtitle.endTime)
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
                top: showtime ? (subtitleElement.offsetTop - (parentElement.clientHeight - subtitleElement.clientHeight) / 2) : 0
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
                    <ul onDoubleClick={subFullscreen}>
                        <span className={styles['subtitle-switch']}>
                            <input type="checkbox"
                                checked={showtime}
                                onChange={() => {
                                    localStorage.setItem('showtime', !showtime)
                                    setShowtime(value => !value)
                                }} />
                            <span> 显示时间</span>
                            {subType == 'srt' &&
                                <button onClick={editLrc}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
                                        <path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12 12 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A20 20 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a20 20 0 0 0 1.349-.476l.019-.007.004-.002h.001M14 1.221c-.22.078-.48.167-.766.255-.81.252-1.872.523-2.734.523-.886 0-1.592-.286-2.203-.534l-.008-.003C7.662 1.21 7.139 1 6.5 1c-.669 0-1.606.229-2.415.478A21 21 0 0 0 3 1.845v6.433c.22-.078.48-.167.766-.255C4.576 7.77 5.638 7.5 6.5 7.5c.847 0 1.548.28 2.158.525l.028.01C9.32 8.29 9.86 8.5 10.5 8.5c.668 0 1.606-.229 2.415-.478A21 21 0 0 0 14 7.655V1.222z" />
                                    </svg>
                                </button>
                            }
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
                                        const msgEl = document.querySelector(`.${styles['subtitle-switch']}`);
                                        let ok = copyTextToClipboard(`${window.location.href.split('#t=')[0]}#t=${parseTime(subtitle.startTime)}`);
                                        ok && msgEl?.classList.add(`${styles['show-copied']}`);
                                        setTimeout(() => msgEl?.classList.remove(`${styles['show-copied']}`), 1500)
                                    }}
                                >{subtitle.startTime.split(',')[0]}</span>}
                                <span className={`${styles['subtitle-text']} ${index === currentSubtitleIndex && styles['current-line']}`}
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

