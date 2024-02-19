import React from 'react'
import { useEffect, useState, useRef } from 'react';
import '../css/subtitle-player.css'

const SubtitlePlayer = () => {
    const [subtitles, setSubtitles] = useState([]);
    const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(-1);
    const videoRef = useRef(null);
    const baseUrl = 'https://s3.ap-northeast-1.wasabisys.com/hdcx/jmy/%e6%85%a7%e7%81%af%e7%a6%85%e4%bf%ae%e8%af%be/'

    // 解析SRT字幕文件
    useEffect(() => {
        fetch(`${baseUrl}${location.hash.split('#')[1].replace(/mp\d/, 'srt')}`)
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
        <div className='subtitle-container'>
            <div className='item'>
                <video ref={videoRef} controls>
                    <source src={`${baseUrl}${location.hash.split('#')[1]}`}
                        type="video/mp4" />
                </video>
            </div>
            {subtitles.length > 0 &&
                <div className='item'>
                    <ul
                        className="subtitles-box overflow-y-scroll h-80">
                        {subtitles.map((subtitle, index) => (
                            <li
                                onClick={() => videoRef.current.currentTime = parseTime(subtitle.startTime)}
                                key={index}
                                id={`subtitle-${index}`}
                                className={`subtitle-line cursor-pointer`}
                            >
                                <span className='p-1 font-thin text-xs'>{subtitle.startTime.split(',')[0]}</span>
                                <span className={`hover:text-blue-400 ${index === currentSubtitleIndex && 'text-blue-400 text-lg'}`}>{subtitle.text}</span>
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
            inline: 'center',
        });
    }
};

export default SubtitlePlayer
