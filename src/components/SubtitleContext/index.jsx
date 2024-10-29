import React, { useEffect, useState, useRef } from 'react';
import styles from './index.module.css';
import { useHistory } from '@docusaurus/router';
import useLocalStorageState from 'use-local-storage-state'
import { useLocation } from '@docusaurus/router';

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
export const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60);

    // 格式化为两位数
    const formattedHours = String(hours).padStart(2, '0') + ':';
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds?.split('.')[0]).padStart(2, '0');
    const formattedMillSeconds = seconds?.split('.')[1]?.slice(0, 3);

    return `${formattedHours}${formattedMinutes}:${formattedSeconds},${formattedMillSeconds}`;
};

const VideoPlayer = ({ src, current, setCurrent }) => {
    const location = useLocation();
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    let videoSrc = (src === undefined ? `${baseUrl}${location.hash.slice(1)}` : src);
    const [duration, setDuration] = useState(0);

    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [showtime, setShowtime] = useState(localStorage.getItem('showtime') !== 'false');
    const [subAlignCenter, setSubAlignCenter] = useState(true);
    const videoRef = useRef(null);
    const subRef = useRef(null);
    const ulRef = useRef(null);
    const wraperRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])
    let matchRxl = videoSrc?.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)
    let keqianTime = 88;
    let kehouTime = 140;
    const [playInfo, setPlayInfo] = useLocalStorageState('playInfo')

    const history = useHistory();
    const copyText = async (text) => {
        const msgEl = document.querySelector(`.${styles['subtitle-switch']}`);
        try {
            await navigator.clipboard.writeText(text);
            msgEl?.classList.add(`${styles['show-copied']}`);
            setTimeout(() => msgEl?.classList.remove(`${styles['show-copied']}`), 1000)
            return true;
        } catch (err) {
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
        let subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));
        if (matchRxlQa) {
            subtitleLines = subtitleLines.slice(21)
        }

        subtitleLines.forEach((line) => {
            const parts = line.trim()?.split(new RegExp('\r?\n'));
            const index = parts[0];
            const time = parts[1]?.split(' --> ');
            const text = parts.slice(2).join('\n');
            let timeStart = time[0]
            if ((matchRxl || matchRxlQa) && parseTime(timeStart) > keqianTime + 5) {
                timeStart = matchRxlQa ?
                    parseTime(timeStart) + (duration - 2868) :
                    parseTime(timeStart) + (- 2870)

                timeStart = formatTime(timeStart)
            }

            subtitlesArray.push({ index, startTime: timeStart, endTime: time[1], text });
        });

        setSubtitles(subtitlesArray);
    };

    useEffect(() => {
        if (videoRef.current) {
            // 清除栅格布局, 使宽度为100%
            document.querySelector('article')?.parentElement.removeAttribute('class')
            let isMp4 = /\.(mp4|webm)/.test(videoSrc)
            let matchJx = /\/v\/[45]jx/.test(videoSrc)
            if (matchJx) {
                videoRef.current.pause()
            }

            // console.log({ current, isMp4 });
            if (isMp4) {
                videoRef.current.className = styles.video
                current > 0 && !document.fullscreenElement && videoRef.current.requestFullscreen()
            } else {
                document.fullscreenElement && document.exitFullscreen()
                videoRef.current.className = styles.audio
            }
        }

        const fetchSub = (suburl) => {
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
                        wraperRef.current.parentElement.style.flexDirection = 'column'
                    }
                })
                .catch(e => console.error(e));
        }

        if (matchRxl || matchRxlQa) {
            let suburl = `https://box.hdcxb.net/d/慧灯禅修/001-入行论释/fudao/入行论辅导字幕（课诵部分）.srt`
            fetchSub(suburl)
        } else if (decodeURI(location.hash).includes("慧灯禅修课")) {
            let videoName = videoSrc.slice(95)?.split('.mp4')[0]
            let suburl = `https://box.hdcxb.net/d/禅修课视频/${videoName}.srt`
            fetchSub(suburl)
        } else if (window.screen.orientation.type !== "portrait-primary") {
            wraperRef.current.parentElement.style.flexDirection = 'row'
        }

        setSubtitles([])
    }, [videoSrc]);

    useEffect(() => {
        let timer;
        const video = videoRef.current;
        if (!video) return;

        video.playbackRate = localStorage.getItem('playbackRate') || 1

        const handleTimeUpdate = () => {
            let currentTime = video?.currentTime;
            // console.log(currentTime, endTime, video.duration)
            if (currentTime != null) {
                // 当播放时间超过 endTime 时，切换到下一个视频
                if (endTime && currentTime >= endTime) {
                    clearTimeout(timer)
                    console.log('play next video', { currentTime, endTime })
                    setCurrent(prev => prev + 1)
                    video?.removeEventListener('timeupdate', handleTimeUpdate);
                }

                const subIndex = subtitles.findIndex(subtitle => currentTime >= parseTime(subtitle.startTime) && currentTime <= parseTime(subtitle.endTime));
                if (subIndex !== -1 && subIndex != currentSubtitleIndex) {
                    setCurrentSubtitleIndex(subIndex);
                    subAlignCenter && scrollSubtitleToView(subIndex);
                }
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'ArrowLeft') { // 左箭头
                ulRef.current.scrollBy(0, 30 - window.innerHeight);
            } else if (event.key === 'ArrowRight') { // 右箭头
                ulRef.current.scrollBy(0, window.innerHeight - 30);
            } else if (event.key === 'ArrowUp') {
                video.currentTime = Math.max(0, videoRef.current.currentTime - 10);  // 上箭头后退10s
            } else if (event.key === 'ArrowDown') {
                videoRef.current.currentTime += 30; // 下箭头前进30s
            } else if (event.altKey && event.key === '1') {
                videoRef.current.playbackRate = 1
                localStorage.setItem('playbackRate', 1)
            } else if (event.altKey && event.key === '2') {
                videoRef.current.playbackRate = 2
                localStorage.setItem('playbackRate', 2)
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

    const handleVideoEnd = () => {
        console.log('ended');
        if (videoSrc !== 'blank') {
            setCurrent(prev => prev + 1)
        }
    }

    const scrollSubtitleToView = (index) => {
        const subtitleElement = document.getElementById(`subtitle-${index}`);
        const parentElement = ulRef.current;

        if (parentElement) {
            parentElement.scroll({
                behavior: 'auto',
                top: subtitleElement?.offsetTop + 60 - (parentElement?.clientHeight - subtitleElement?.clientHeight) / 2
            });
        }
    };

    const handleLoadedMetadata = (event) => {
        const videoDuration = event.target.duration;
        // console.log({videoDuration});

        setDuration(videoDuration);
        if (videoDuration - endTime < 1) {
            endTime = undefined
        }
        if (typeof window.orientation === 'undefined' && matchRxl) {
            let lessonDuration = Math.round(videoDuration) - keqianTime - kehouTime
            setTimeout(() => {
                let readingUrl = `/refs/rxl/fudao/rxl-fd${getRxlSection(matchRxl[1])}?duration=${lessonDuration}#入菩萨行论第${parseInt(matchRxl[1])}节课`
                console.log('课诵念完，前往阅读页');
                history.push(readingUrl)
                setTimeout(() => {
                    history.push('/playlist')
                }, (lessonDuration + 3) * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000));

            }, keqianTime * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000))
        }
    };

    return (
        <div ref={wraperRef} className={styles['subtitle-container']}>
            <div className={styles.videoBox}>
                {!/\.mp4/.test(videoSrc) && <img src='https://hdcx.s3.ap-northeast-1.wasabisys.com/hdv/p/上师.png' alt='上师知' width={'500'} />}
                {videoSrc !== 'blank' && <video ref={videoRef}
                    className={styles.video}
                    src={videoSrc}
                    controls
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={handleVideoEnd}
                    autoPlay
                    playsInline
                    onPause={() => setPlayInfo({ ...playInfo, paused: true })}
                    onPlay={() => setPlayInfo({ ...playInfo, paused: false })}
                    poster={/\/v\/[45]jx/.test(videoSrc) ?
                        'https://box.hdcxb.net/d/其他资料/f/up/untitled.png' : ''}
                >
                </video>}
            </div>
            {subtitles.length > 0 &&
                <details open style={{ width: '100vw' }}>
                    <summary></summary>
                    <div className={`${styles['subtitle-box']} ${styles.item}`} ref={subRef}>
                        <ul ref={ulRef} onDoubleClick={subFullscreen}>
                            <span className={styles['subtitle-switch']}>
                                <input type="checkbox"
                                    checked={showtime}
                                    onChange={() => {
                                        localStorage.setItem('showtime', !showtime)
                                        setShowtime(value => !value)
                                    }} />
                                <span>时间轴</span>
                                <input type="checkbox"
                                    checked={subAlignCenter}
                                    onChange={() => {
                                        setSubAlignCenter(value => !value)
                                    }} />
                                <span>垂直居中</span>
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
                                            copyText(`${location.href.split('#t=')[0]}#t=${parseTime(subtitle.startTime)}`)
                                        }}
                                    >{subtitle.startTime?.split(',')[0]}</span>}
                                    <p className={`${index === currentSubtitleIndex ? styles['current-line'] : ''}`}
                                        onClick={() => {
                                            videoRef.current.currentTime = parseTime(subtitle.startTime)
                                            const subtitleIndex = subtitles.findLastIndex(subtitle => videoRef.current?.currentTime > parseTime(subtitle.startTime))
                                            setCurrentSubtitleIndex(subtitleIndex)
                                        }}>
                                        {subtitle.text}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </details>
            }
        </div >
    );
};



export default function SubtitleContext(props) {
    return <VideoPlayer {...props} />
};

function getRxlSection(lesson) {
    if (lesson >= 1 && lesson <= 14) {
        return '01'
    }
    else if (lesson >= 15 && lesson <= 28) {
        return '02'
    }
    else if (lesson >= 29 && lesson <= 35) {
        return '03'
    }
    else if (lesson >= 36 && lesson <= 46) {
        return '04'
    }
    else if (lesson >= 47 && lesson <= 69) {
        return '05'
    }
    else if (lesson >= 70 && lesson <= 94) {
        return '06'
    }
    else if (lesson >= 95 && lesson <= 110) {
        return '07'
    }
    else if (lesson >= 111 && lesson <= 152) {
        return '08'
    }
    else if (lesson >= 153 && lesson <= 190) {
        return '09'
    }
    else if (lesson >= 191 && lesson <= 201) {
        return '10'
    }
}