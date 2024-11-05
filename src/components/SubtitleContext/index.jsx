import React, { useEffect, useState, useRef } from 'react';
import styles from './index.module.css';
import { useHistory } from '@docusaurus/router';
import useLocalStorageState from 'use-local-storage-state'
import { useLocation } from '@docusaurus/router';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { parseTime, parseSubtitles, fetchText, getRxlSection, copyText } from '@site/src/utils'

const VideoPlayer = ({ src, current, setCurrent }) => {
    const location = useLocation();
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/';
    const [videoSrc, setVideoSrc] = useState(src === undefined ? `${baseUrl}${location.hash.slice(1)}` : src);
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [subAlignCenter, setSubAlignCenter] = useState(true);
    const videoRef = useRef(null);
    const wraperRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])
    let matchRxl = videoSrc?.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)
    let keqianTime = 88;
    let kehouTime = 140;
    const [playInfo, setPlayInfo] = useLocalStorageState('playInfo', { defaultValue: { paused: true, showTimeLine: false, currentTime: 0, title: '', current: 0 } })
    const history = useHistory();

    useEffect(() => {
        if (src && src !== videoSrc) { setVideoSrc(src) }
        if (videoRef.current) {
            // 清除栅格布局, 使宽度为100%
            document.querySelector('article')?.parentElement.removeAttribute('class')
            let isMp4 = /\.(mp4|webm)/.test(videoSrc)
            let matchJx = /\/v\/[45]jx/.test(videoSrc)
            if (matchJx) {
                videoRef.current.pause()
            }

            if (isMp4) {
                videoRef.current.className = styles.video
                if (current && !videoSrc.includes("恒常念诵") && !document.fullscreenElement && videoRef.current?.requestFullscreen) {
                    videoRef.current?.requestFullscreen()
                }
            } else {
                document.fullscreenElement && document.exitFullscreen()
                videoRef.current.className = styles.audio
            }
        }

        setPlayInfo(prevPlayInfo => ({
            ...prevPlayInfo,
            title: src?.slice(src?.lastIndexOf('/') + 1)
        }))

        setSubtitles([])
    }, [src, videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.playbackRate = playInfo?.playbackRate || 1

        let timer;
        const handleTimeUpdate = () => {
            let currentTime = video?.currentTime;
            // console.log(currentTime, endTime, video.duration)

            if (currentTime != null) {
                if (!timer) {
                    timer = setTimeout(() => {
                        setPlayInfo({ ...playInfo, currentTime })
                        timer = null; // 重置 timer
                    }, 1000);
                }

                // 当播放时间超过 endTime 时，切换到下一个视频
                if (endTime && currentTime >= endTime) {
                    clearTimeout(timer)
                    console.log('play next video', { currentTime, endTime })
                    setCurrent(prev => prev + 1)

                    video?.removeEventListener('timeupdate', handleTimeUpdate);
                }

                const subIndex = subtitles?.findIndex(subtitle => currentTime >= parseTime(subtitle.startTime) && currentTime <= parseTime(subtitle.endTime));
                if (subIndex !== -1 && subIndex != currentSubtitleIndex) {
                    setCurrentSubtitleIndex(subIndex);
                    subAlignCenter && scrollSubtitleToView(subIndex);
                }
            }
        };

        const changeSpeed = (flag) => {
            let rate = 1;
            switch (flag) {
                case '-':
                    rate = videoRef.current.playbackRate - 0.25
                    break;
                case '+':
                    rate = videoRef.current.playbackRate + 0.25
                    break;
                default:
                    rate = 1
                    break;
            }
            videoRef.current.playbackRate = rate
            setPlayInfo({ ...playInfo, playbackRate: rate })
        }
        const handleKeyDown = (event) => {
            if (!event.altKey)
                return;

            if (event.key?.toLowerCase() === 'z' && videoRef.current.playbackRate > 0.25) {
                changeSpeed('-')
            } else if (event.key?.toLowerCase() === 'x' && videoRef.current.playbackRate < 3) {
                changeSpeed('+')
            } else if (event.key?.toLowerCase() === 'c') {
                changeSpeed()
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
        subtitleElement.scrollIntoView({ block: 'center' })
    };

    const handleLoadedMetadata = (event) => {
        const videoDuration = event.target.duration;
        if (videoSrc === 'blank') {
            videoRef?.current.pause
        }
        // console.log({videoDuration});
        const handleSubtitleFetch = async (suburl) => {
            let subText = await fetchText(suburl)
            let subtitlesArray = parseSubtitles(subText, videoDuration, src, keqianTime)
            setSubtitles(subtitlesArray);
            wraperRef.current.parentElement.style.flexDirection = 'column'
        }

        if (matchRxl || matchRxlQa) {
            let suburl = `https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/001-入行论释/fudao/入行论辅导字幕（课诵部分）.srt`
            handleSubtitleFetch(suburl)
        } else if (decodeURI(location.hash).includes("慧灯禅修课")) {
            let videoName = videoSrc.slice(95)?.split('.mp4')[0]
            let suburl = `https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/慧灯禅修课/${videoName}.srt`
            handleSubtitleFetch(suburl)
        } else if (window.screen.orientation.type !== "portrait-primary") {
            wraperRef.current.parentElement.style.flexDirection = 'row'
        }

        // console.log({ videoDuration, endTime }, '清除endTime');
        if (videoDuration - endTime <= 1) {
            endTime = undefined
        }
        // if (typeof window.orientation === 'undefined' && matchRxl) {
        //     let lessonDuration = Math.round(videoDuration) - keqianTime - kehouTime
        //     setTimeout(() => {
        //         let readingUrl = `/refs/rxl/fudao/rxl-fd${getRxlSection(matchRxl[1])}?duration=${lessonDuration}#入菩萨行论第${parseInt(matchRxl[1])}节课`
        //         if (!playInfo?.paused && matchRxl) {
        //             console.log(keqianTime,'课诵念完，前往阅读页',lessonDuration);
        //             history.push(readingUrl)
        //             setTimeout(() => {
        //                 history.push('/playlist')
        //             }, (lessonDuration + 3) * (1 / playInfo?.playbackRate ?? 1) * 1000);
        //         }
        //     }, keqianTime * (1 / playInfo?.playbackRate ?? 1) * 1000)
        // }
    };

    const mediaProps = {
        ref: videoRef,
        className: styles.video,
        src: videoSrc,
        controls: true,
        onLoadedMetadata: handleLoadedMetadata,
        onEnded: handleVideoEnd,
        autoPlay: current === 0 ? false : true,
        onPause: () => setPlayInfo({ ...playInfo, paused: true }),
        onPlay: () => setPlayInfo({ ...playInfo, paused: false }),
    };

    return (
        <div ref={wraperRef} className={styles['subtitle-container']}>
            <div className={styles.videoBox}>
                {/\.(mp4|webm)/.test(videoSrc) ?
                    <video
                        {...mediaProps}
                        poster={/\/v\/[45]jx/.test(videoSrc) ?
                            'https://box.hdcxb.net/d/其他资料/f/up/untitled.png' : ''}
                    >
                    </video> :
                    <>
                        <img src='https://hdcx.s3.ap-northeast-1.wasabisys.com/hdv/p/上师.jpg' alt='上师知' width={'500'} />
                        <audio {...mediaProps} />
                    </>
                }
            </div>
            {subtitles?.length > 0 &&
                <details open style={{ width: '100vw' }}>
                    <summary></summary>
                    <div className={`${styles['subtitle-box']} ${styles.item}`}>
                        <ul>
                            <span className={styles['subtitle-switch']}>
                                <input type="checkbox"
                                    checked={playInfo?.showTimeLine}
                                    onChange={() => setPlayInfo({ ...playInfo, showTimeLine: !playInfo?.showTimeLine })} />
                                <span>时间轴</span>
                                <input type="checkbox"
                                    checked={subAlignCenter}
                                    onChange={() => {
                                        setSubAlignCenter(value => !value)
                                    }} />
                                <span>垂直居中</span>
                            </span>
                            {subtitles.map((subtitle, index) => (
                                <li key={index} id={`subtitle-${index}`} className={styles['subtitle-line']}>
                                    {playInfo?.showTimeLine && <span title='点击复制' className={styles.timeline}
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
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => <VideoPlayer {...props} />}
        </BrowserOnly>
    );
};
