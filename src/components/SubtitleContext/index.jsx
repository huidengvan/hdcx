import React, { useEffect, useState, useRef } from 'react';
import styles from './index.module.css';
import { useHistory } from '@docusaurus/router';
import useLocalStorageState from 'use-local-storage-state'
import BrowserOnly from '@docusaurus/BrowserOnly';
import { parseTime, parseSubtitles, fetchText, getRxlSection, copyText } from '@site/src/utils'
import { useVideo } from './VideoContext';
import { isShortKesong } from '../../utils';

const VideoPlayer = ({ src, current, setCurrent }) => {
    const baseUrl = location.hash.includes('http') ? '' : 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/慧灯禅修课/';
    const [videoSrc, setVideoSrc] = useState(src === undefined ? `${baseUrl}${location.hash.slice(1)}` : src);
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const videoRef = useVideo();
    const wraperRef = useRef(null);
    let endTime = parseTime(src?.split(',')[1])
    let matchRxl = videoSrc?.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)
    let shortKesong = isShortKesong(src?.slice(src?.lastIndexOf('/') + 1))
    let keqianTime = shortKesong ? 17 : 90;
    let kehouTime = shortKesong ? 10 : 140;
    const isMp4 = /\.(mp4|webm)/.test(videoSrc)

    const [playInfo, setPlayInfo] = useLocalStorageState('playInfo', { defaultValue: { paused: true, showTimeLine: false, subAlignCenter: true, currentTime: 0, title: '', current: 0 } })
    const history = useHistory();

    useEffect(() => {
        if (src && src !== videoSrc) { setVideoSrc(src) }
        if (videoRef.current) {
            // 清除栅格布局, 使宽度为100%
            document.querySelector('article')?.parentElement.removeAttribute('class')
            let matchJx = /\/v\/[45]jx/.test(videoSrc)
            if (matchJx) {
                videoRef.current.pause()
            }

            if (!matchRxl) {
                if (current && !videoSrc.includes("恒常念诵") && !document.fullscreenElement && videoRef.current?.requestFullscreen) {
                    videoRef.current?.requestFullscreen()
                }
            } else {
                document.fullscreenElement && document.exitFullscreen()
            }
        }

        setPlayInfo(prevPlayInfo => ({
            ...prevPlayInfo,
            keqianTime,
            title: src?.slice(src?.lastIndexOf('/') + 1)
        }))

        // 切换src后清空字幕
        return setSubtitles([])
    }, [src, videoSrc]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.playbackRate = playInfo?.playbackRate ?? 1
        let huixiangTime = video.duration - kehouTime
        // console.log(matchRxl);
        let readingUrl = matchRxl ? `/refs/rxl/fudao/rxl-fd${getRxlSection(matchRxl[1])}#入菩萨行论第${parseInt(matchRxl[1])}节课` : ''

        const handleTimeUpdate = ({ target: { currentTime } }) => {
            // console.log(currentTime, endTime, duration)
            const subIndex = subtitles?.findIndex(subtitle => currentTime >= parseTime(subtitle?.startTime) && currentTime <= parseTime(subtitle?.endTime));
            // 当播放时间超过 endTime 时，切换到下一个视频
            if (endTime && currentTime >= endTime) {
                video?.removeEventListener('timeupdate', handleTimeUpdate);
                console.log('play next video', { currentTime, endTime })
                setCurrent(prev => prev + 1)
            } else if (matchRxl && currentTime > keqianTime && currentTime < keqianTime + 1) {
                // 当播放是入行论辅导时 typeof window.orientation === 'undefined' && 不是移动端时
                console.log(keqianTime, '课诵念完，前往阅读页');
                history.push(readingUrl)
            } else if (matchRxl && currentTime > huixiangTime && currentTime < huixiangTime + 1) {
                console.log(keqianTime, '回向阶段，返回列表页');
                history.push('/playlist')
            } else if (subIndex !== -1 && subIndex != currentSubtitleIndex) {
                setCurrentSubtitleIndex(subIndex);
                playInfo.subAlignCenter && subtitles.length - 5 > subIndex && scrollSubtitleToView(subIndex);
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
    }, [subtitles, currentSubtitleIndex, playInfo]);

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

    const handleSubtitleFetch = async (suburl, duration) => {
        let subText = await fetchText(suburl)
        let subtitlesArray = parseSubtitles(subText, duration, src, keqianTime)
        setSubtitles(subtitlesArray);
        const subtitleWrapper = wraperRef.current?.parentElement
        if (subtitleWrapper) subtitleWrapper.style.flexDirection = 'column'
    }

    const handleLoadedMetadata = (event) => {
        const { duration: videoDuration } = event?.target;
        if (videoSrc === 'blank') {
            videoRef?.current.pause
        }
        // console.log({ videoDuration });

        if (keqianTime > 20 && (matchRxl || matchRxlQa)) {
            let suburl = `https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/001-入行论释/fudao/入行论辅导字幕（课诵部分）.srt`
            handleSubtitleFetch(suburl, videoDuration)
        } else if (decodeURI(location.hash).includes("慧灯禅修课")) {
            let suburl = videoSrc?.replace('mp4', 'srt')
            handleSubtitleFetch(suburl, videoDuration)
        } else if (window.screen.orientation.type !== "portrait-primary") {
            const subtitleWrapper = wraperRef.current?.parentElement
            if (subtitleWrapper) subtitleWrapper.style.flexDirection = 'row'
        }

        // console.log({ videoDuration, endTime }, '清除endTime');
        if (videoDuration - endTime <= 1) {
            endTime = undefined
        }
    };

    const mediaProps = {
        ref: videoRef,
        className: isMp4 ? styles.video : styles.audio,
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
                {
                    <video
                        {...mediaProps}
                        poster={/\/v\/[45]jx/.test(videoSrc) ?
                            'https://box.hdcxb.net/d/其他资料/f/up/untitled.png' : ''}
                    >
                    </video>
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
                                    checked={playInfo?.subAlignCenter}
                                    onChange={() => setPlayInfo({ ...playInfo, subAlignCenter: !playInfo?.subAlignCenter })} />
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
