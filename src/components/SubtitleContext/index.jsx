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

const VideoPlayer = ({ src, setCurrent, subPath }) => {
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    let videoSrc = src || `${baseUrl}${location.hash.slice(1)}`;
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [showtime, setShowtime] = useState(localStorage.getItem('showtime') !== 'false');
    const videoRef = useRef(null);
    const subRef = useRef(null);
    const ulRef = useRef(null);
    const wraperRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])
    let matchRxl = videoSrc.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)
    let keqianTime = 90;
    let kehouTime = 140;
    let audoReadTab;

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
        let subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));
        if(matchRxlQa){
            subtitleLines =subtitleLines.slice(20)
        }
        
        subtitleLines.forEach((line) => {
            const parts = line.trim()?.split(new RegExp('\r?\n'));
            const index = parts[0];
            const time = parts[1]?.split(' --> ');
            const text = parts.slice(2).join('\n');
            subtitlesArray.push({ index, startTime: time[0], endTime: time[1], text });
        });

        setSubtitles(subtitlesArray);
    };

    useEffect(() => {
        // 清除栅格布局, 使宽度为100%
        document.querySelector('main').firstChild.removeAttribute('class')
        document.querySelector('article').parentElement.removeAttribute('class')
        document.querySelector('footer').style.display = 'none'
        videoRef.current.src = videoSrc

        if (videoRef.current) {
            try {
                videoRef.current.play()
            } catch (error) {
                // console.error('Playback failed:', error);
            }
        }

        if (subPath || (matchRxl || matchRxlQa)) {
            let videoName = videoSrc.substring(videoSrc.lastIndexOf('/') + 1)
            let suburl = subPath ?
                `${subPath}${videoName.replace(/\.[^/.]+$/, '.srt')}` :
                `https://box.hdcxb.net/d/慧灯禅修/001-入行论释/fudao/入行论辅导字幕（课诵部分）.srt`
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
                        wraperRef.current.parentElement.style.flexDirection = 'column'
                    }
                });
        }

        if (typeof window.orientation === 'undefined' && matchRxl && !audoReadTab) {
            // 课诵念完，打开新标签页
            setTimeout(() => {
                let duration = Math.ceil(videoRef.current.duration) - keqianTime - kehouTime
                let tabUrl = `/refs/rxl/fudao/rxl-fd${getRxlSection(matchRxl[1])}?duration=${duration}#入菩萨行论第${parseInt(matchRxl[1])}节课`

                if (duration) {
                    audoReadTab = window.open(tabUrl);
                }

                if (!audoReadTab) {
                    confirm('如需开启自动阅读，请允许打开新标签');
                }
            }, keqianTime * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000))
        }


        setSubtitles([])

    }, [src]);

    useEffect(() => {
        let timer;
        const video = videoRef.current;
        video.playbackRate = localStorage.getItem('playbackRate') || 1
        setTimeout(() => {
            if (!endTime || video?.duration - endTime < 1) {
                endTime = video.duration;
            }
        }, 3000);
        const handleTimeUpdate = () => {
            let currentTime = video?.currentTime;
            if (currentTime != null) {
                // 当播放时间超过处于正文时
                if ((matchRxl || matchRxlQa) && currentTime > 84 && video?.duration - currentTime > kehouTime) {
                    return;
                }

                // 当播放时间超过 endTime 时，切换到下一个视频
                if (currentTime > endTime - 1) {
                    // console.log(currentTime, endTime, video.duration)
                    // 执行切换到下一个视频的操作
                    clearTimeout(timer)
                    timer = setTimeout(() => {
                        // console.log("Switching to next video");
                        setCurrent(prev => prev + 1)
                        endTime = undefined
                    }, 1000);
                } else if ((matchRxl || matchRxlQa) && video?.duration - currentTime <= kehouTime) {
                    currentTime = matchRxlQa ?
                        currentTime - (video?.duration - 2743) + 116 :
                        currentTime - (video?.duration - 2870)

                    // 关闭新标签页
                    if (!audoReadTab?.closed) audoReadTab?.close();
                }

                if (currentTime >= parseTime(subtitles[currentSubtitleIndex + 1]?.startTime)
                    && currentSubtitleIndex < subtitles.length - 1) {
                    setCurrentSubtitleIndex(currentSubtitleIndex + 1);
                    scrollSubtitleToView(currentSubtitleIndex);
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


    const scrollSubtitleToView = (index) => {
        const subtitleElement = document.getElementById(`subtitle-${index}`);
        const parentElement = ulRef.current;

        if (parentElement) {
            parentElement.scroll({
                behavior: 'auto',
                top: subtitleElement?.offsetTop - 60 - (parentElement?.clientHeight - subtitleElement?.clientHeight) / 2
            });
        }
    };


    return (
        <div ref={wraperRef} className={styles['subtitle-container']}>
            <video ref={videoRef}
                style={{ minWidth: '50%', maxHeight: '640px' }} controls>
                <source src={`${videoSrc}`} type="video/mp4" />
            </video>
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