import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { ignoredCharacters, bgColors as colors, locateParagraph, getStartNode, getRxlEndNode, filterFootnote, getPlayerDom, isSameLesson } from '@site/src/utils'
import useLocalStorageState from 'use-local-storage-state';

export default function DocRootWrapper(props) {
  const location = useLocation();

  let docRoot, articleRef, endPara;
  const [playInfo, _] = useLocalStorageState('playInfo')
  const [timeLines, setTimeLines] = useState([])
  const articleTitle = decodeURI(location.hash?.slice(1))
  const [currentPara, setCurrentPara] = useLocalStorageState('currentPara')
  const [autoRead, setAutoRead] = useState(false)
  const matchSameLesson = isSameLesson(articleTitle, playInfo?.title)
  const video = getPlayerDom()

  useEffect(() => {
    const duration = video?.duration

    articleRef = document.querySelector('article').parentElement.parentElement
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
  }, [getPlayerDom]);

  useEffect(() => {
    console.log({ autoRead }, timeLines.length, video?.duration);
    if (!video || !autoRead || timeLines.length === 0) return;

    let currentLine = timeLines[0];
    const handleTimeUpdate = ({ target: { currentTime } }) => {
      if (currentTime >= currentLine?.end) {
        currentLine = timeLines.find(x => currentTime >= x.start && currentTime < x.end)

        if (currentLine) {
          locateParagraph(currentLine.para)
          setCurrentPara(currentLine.para)
        }
        console.log({ currentLine });
        console.log(`update`, { currentTime }, 'currentPara:', currentLine?.para);
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate);
  }, [getPlayerDom, timeLines, autoRead]);

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
    setAutoRead(true)
    handleWidescreen()
  };

  const toggleAutoread = () => {
    setAutoRead(prev => {
      if (prev === true) {
        alert("自动阅读停止")
      }

      return !prev
    })
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

    if (event.altKey && keyActions[key]) {
      event.preventDefault();
      keyActions[key]();
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
      <DocRoot {...props} />
    </>
  );
}
