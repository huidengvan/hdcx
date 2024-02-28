import React from 'react'
import { useEffect, useState, useRef } from 'react';
import '../css/subtitle-player.css'
import BrowserOnly from '@docusaurus/BrowserOnly';

const VideoFull = ({ src }) => {
    const baseUrl = 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/'

    const videoSrc = src && `${src}#t${location.hash.split('#t').pop()}` || `${baseUrl}${location.hash.slice(1)}`;
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const [TimeLine, setTimeLine] = useState(true)
    const videoRef = useRef(null);

    // 解析SRT字幕文件
    useEffect(() => {
        // 清除栅格布局, 使宽度为100%
        document.querySelector('article').parentElement.className = ''
        fetch(`${videoSrc.replace(/mp[34]/, 'srt')}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(data => {
                parseSRT(data);
            })
        // 辅助函数：将srt文件解析成数组
        const parseSRT = (data) => {
            const subtitlesArray = [];
            const subtitleLines = data.trim().split('\n\n');
            subtitleLines.forEach((line) => {
                const parts = line.trim().split('\n');
                const index = parts[0];
                const time = parts[1].split(' --> ');
                const text = parts.slice(2).join('\n');
                subtitlesArray.push({ index, startTime: time[0], endTime: time[1], text });
            });
            setSubtitles(subtitlesArray);
        };
    }, []);

    // 监听视频时间更新事件
    useEffect(() => {
        const video = videoRef.current;
        const handleTimeUpdate = () => {
            const currentTime = video.currentTime;
            const currentSubtitleIndex = subtitles.findIndex(subtitle =>
                currentTime >= parseTime(subtitle.startTime) && currentTime <= parseTime(subtitle.endTime)
            );
            if (currentSubtitleIndex !== -1) {
                setCurrentSubtitleIndex(currentSubtitleIndex);
                scrollSubtitleToView(currentSubtitleIndex);
            }
        };
        video.addEventListener('timeupdate', handleTimeUpdate);
        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [subtitles]);

    // 辅助函数：将时间格式转换为秒数
    const parseTime = (timeString) => {
        const parts = timeString.split(':');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseFloat(parts[2].replace(',', '.'));
        return hours * 3600 + minutes * 60 + seconds;
    };

    return (
        <div className='subtitle-container' style={{
            display: src || location.hash?.includes('mp') ? 'flex' : 'none'
        }}>
            <div className='item'>
                <video ref={videoRef} width={'100%'} controls>
                    <source src={`${videoSrc}`}
                        type="video/mp4" />
                </video>
            </div>
            {subtitles.length > 0 &&
                <div
                    id='subtitle-box'
                    className='item'>
                    <ul
                        onDoubleClick={() => {
                            videoRef.current.paused ?
                                videoRef.current.play() :
                                videoRef.current.pause()
                        }}>
                        <label className="subtitle-switch">
                            <input type="checkbox"
                                checked={TimeLine}
                                onChange={() => setTimeLine(value => !value)} />
                            <span> 显示时间</span>
                        </label>
                        {subtitles.map((subtitle, index) => (
                            <li
                                key={index}
                                id={`subtitle-${index}`}
                                className={`subtitle-line`}
                            >
                                {TimeLine && <span title='双击复制' className='p-1 font-thin text-xs'
                                    onDoubleClick={(e) => {
                                        e.stopPropagation()
                                        const msgEl = document.querySelector('.subtitle-switch');
                                        msgEl.classList.add('show-copied');
                                        navigator.clipboard.writeText(`${location.href.split('#t=')[0]}#t=${parseTime(subtitle.startTime)}`);

                                        setTimeout(() => msgEl.classList.remove('show-copied'), 1500)
                                    }}
                                >{subtitle.startTime.split(',')[0]}
                                </span>}
                                <div>
                                    <span className={`subtitle-text hover:text-blue-400 cursor-pointer ${index === currentSubtitleIndex && 'text-blue-400 text-lg'}`}
                                        title='双击暂停/播放'
                                        onClick={() => videoRef.current.currentTime = parseTime(subtitle.startTime)}

                                    >{subtitle.text}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>

                </div>}
        </div>
    );
};

const scrollSubtitleToView = (index) => {
    const subtitleElement = document.getElementById(`subtitle-${index}`);
    if (subtitleElement) {
        subtitleElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }
};


export default function SubtitlePlayer({ src }) {
    return (
        <BrowserOnly>
            {() => <VideoFull src={src} />}
        </BrowserOnly>
    )
}