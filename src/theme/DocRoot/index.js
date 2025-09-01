import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { ignoredCharacters, bgColors as colors, locateParagraph, getStartNode, getRxlEndNode, filterFootnote, isSameLesson } from '@site/src/utils'
import useLocalStorageState from 'use-local-storage-state';
import { useVideo } from '../../components/SubtitleContext/VideoContext';

export default function DocRootWrapper(props) {
  const location = useLocation();

  let docRoot, articleRef, endPara;
  const [playInfo, setPlayInfo] = useLocalStorageState('playInfo')
  const [timeLines, setTimeLines] = useState([])
  const articleTitle = decodeURI(location.hash?.slice(1))
  const [currentPara, setCurrentPara] = useLocalStorageState('currentPara')
  const matchSameLesson = isSameLesson(articleTitle, playInfo?.title)
  const videoRef = useVideo();
  const video = videoRef.current

  useEffect(() => {
    const duration = video?.duration

    articleRef = document.querySelector('article')?.parentElement?.parentElement
    docRoot = document.querySelector('[class*=docRoot]')

    const bgColorIndex = localStorage.getItem('bgColorIndex');
    if (bgColorIndex && articleRef) {
      docRoot.style.backgroundColor = colors[bgColorIndex].color;
    }

    if (!isNaN(duration) && matchSameLesson) {
      calcAudioSpeed(duration)
      console.log({ duration, currentPara, articleTitle });
    } else if (articleTitle) {
      locateParagraph(articleTitle)
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dblclick', handleFullscreen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [videoRef]);

  useEffect(() => {
    console.log('autoRead:', playInfo?.autoRead, timeLines.length, video?.duration);
    if (!video || timeLines.length === 0) return;

    let currentLine = timeLines[0];
    const handleTimeUpdate = ({ target: { currentTime } }) => {
      // 只在 autoRead 为 true 时执行
      if (!playInfo?.autoRead) return;

      if (currentTime >= currentLine?.end) {
        currentLine = timeLines.find(x => currentTime >= x.start && currentTime < x.end);

        if (currentLine) {
          locateParagraph(currentLine.para);
          setCurrentPara(currentLine.para);
        }
        console.log({ currentLine });
        console.log(`update`, { currentTime }, 'currentPara:', currentLine?.para);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    // 清理事件监听器
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoRef, timeLines, playInfo?.autoRead]);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    locateParagraph(currentPara);
  };

  const handleWidescreen = () => {
    let tocNode = document.querySelector('.theme-doc-toc-desktop')
    if (articleRef.className == '') {
      tocNode.style.display = ''
      articleRef.className = 'col docItemCol_node_modules-@docusaurus-theme-classic-lib-theme-DocItem-Layout-styles-module'
      articleRef.style.fontSize = ''
    } else {
      tocNode.style.display = 'none'
      articleRef.className = ''
      articleRef.style.fontSize = 'x-large'
    }

    let sidebarButton = document.querySelector('[class*="collapseSidebarButton"]')
    sidebarButton?.click()

    setTimeout(() => {
      console.log('宽屏模式切换，重新定位段落', { currentPara });
      locateParagraph(currentPara);
    }, 200)
  };

  const calcAudioSpeed = (duration) => {
    const startNode = getStartNode(location.hash.slice(1));
    let endNode = filterFootnote(getRxlEndNode(decodeURI(location.hash.slice(1))));
    // console.log(startNode, endNode, duration);
    if (!startNode || !endNode || !duration) { return; }
    if (endNode?.id) {
      setCurrentPara(parseInt(startNode.id?.slice(1)))
      endPara = parseInt(endNode.id?.slice(1));
    }

    let totalWordCount = 0;
    let currentNode = startNode;
    // console.log(parseInt(currentNode?.id?.slice(1)) < endPara);

    let lines = []
    while (currentNode && parseInt(currentNode?.id?.slice(1)) < endPara) {
      let count = currentNode.lastChild?.textContent.replace(ignoredCharacters, '').length;
      lines.push({ para: parseInt(currentNode?.id?.slice(1)), count })
      totalWordCount += count
      currentNode = currentNode.nextElementSibling;
    }

    let startTime = playInfo?.keqianTime ?? 89
    let speed = Math.round(totalWordCount / duration * 1000) / 1000;

    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].start = startTime
      let duration = Math.round(lines[i]?.count / speed)
      startTime += duration
      lines[i].end = startTime
    }

    setTimeLines(lines)
    console.log({ totalWordCount, duration }, '段落数量：', lines.length, '语速：', speed);
    handleWidescreen()
  };

  const toggleAutoread = () => {
    setPlayInfo({ ...playInfo, autoRead: !playInfo?.autoRead })
  }

  const keyActions = {
    't': handleWidescreen,
    'a': toggleAutoread,
    'b': () => {
      const colorIndex = (Number(localStorage.getItem('bgColorIndex')) + 1) % colors.length;
      localStorage.setItem('bgColorIndex', colorIndex);
      docRoot.style.backgroundColor = colors[colorIndex].color;
    }
  };

  const handleKeyDown = (event) => {
    const key = event.key.toLowerCase();

    if ((event.altKey || event.metaKey) && keyActions[key]) {
      event.preventDefault();
      keyActions[key]();
    } else if (event.key === 'ArrowUp') {
      sessionStorage.setItem('scrollBlock', 'end');
    } else if (event.key === 'ArrowDown') {
      sessionStorage.setItem('scrollBlock', 'start');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      window.scrollBy(0, 100 - window.innerHeight);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      window.scrollBy(0, window.innerHeight - 100);
    }
  };

  return (
    <>
      {video && !video?.paused &&
        <label style={{
          position: 'fixed',
          bottom: '0',
          right: '0',
          padding: '5px 10px',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 999,
          borderRadius: '5px',
          color: 'b0b0d0'
        }}><input type="checkbox"
          checked={playInfo?.autoRead}
          onChange={toggleAutoread}
          />
          自动阅读
        </label>}
      <DocRoot {...props} />
    </>
  );
}
