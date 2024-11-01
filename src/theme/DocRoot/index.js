import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { ignoredCharacters, bgColors as colors, getTargetNode, locateParagraph, isSameLesson, getStartNode, getRxlEndNode, filterFootnote } from '@site/src/utils'
import useLocalStorageState from 'use-local-storage-state'

export default function DocRootWrapper(props) {
  const location = useLocation();
  const queryString = location.search;
  const urlParams = new URLSearchParams(queryString);
  const duration = parseInt(urlParams.get('duration'));
  const start = parseInt(urlParams.get('start') || 88);

  let docRoot, articleRef, endPara;
  const [playInfo, _] = useLocalStorageState('playInfo')
  const [articleTitle, setArticleTitle] = useState()
  const [currentPara, setCurrentPara] = useState(0)
  const [timeLines, setTimeLines] = useState([])

  useEffect(() => {
    articleRef = document.querySelector('article').parentElement.parentElement
    docRoot = document.querySelector('[class*=docRoot]')

    const bgColorIndex = localStorage.getItem('bgColorIndex');
    if (bgColorIndex && articleRef) {
      docRoot.style.backgroundColor = colors[bgColorIndex].color;
    }
    let para = decodeURI(location.hash?.slice(1))
    setArticleTitle(para)

    if (duration) {
      calcAudioSpeed()
    } else if (para) {
      locateParagraph(para)
    }
    // console.log({ currentPara, para });

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dblclick', handleFullscreen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (duration && playInfo.currentTime > 1) {
      // console.log(timeLines[currentPara], currentPara);
    }
  }, [playInfo, articleTitle, currentPara]);

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
    console.log(123);

    console.log({ currentPara });
    setTimeout(() => {

      locateParagraph(currentPara);
    }, 100)
  };

  const prevParagraph = () => {
    if (currentPara === 1) return;
    let cur = currentPara - 1
    setCurrentPara(prev => prev - 1)
    locateParagraph(cur - 1);
    let node = getTargetNode(`p{cur}`)
    if (node) {
      node.style.borderLeft = ''
    }
  };

  const nextParagraph = () => {
    let cur = currentPara + 1
    console.log({ currentPara });
    setCurrentPara(prev => prev + 1)
    locateParagraph(cur + 1);
    let node = getTargetNode(`p{cur}`)
    if (node) {
      node.style.borderLeft = '.5px solid #2e8555'
    }
  };

  const autoNextParagraph = () => {
    let targetNode = getTargetNode(`p{currentPara}`)
    if (!isSameLesson(articleTitle, playInfo.title) || !targetNode || currentPara === endPara) {
      console.log(`自动阅读停止`);
      return;
    }
  };

  const autoPaginate = async () => {

    // console.log(`${autoPage ? '开始' : '暂停'}自动阅读`);
  };

  const calcAudioSpeed = () => {
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
      lines.push({ para: currentNode?.id, count })
      totalWordCount += count
      currentNode = currentNode.nextElementSibling;
    }

    let speed = Math.round(totalWordCount / duration * 1000) / 1000;

    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].duration = Math.round(lines[i]?.count / speed)
    }

    setTimeLines(lines)
    console.log({ totalWordCount, duration }, startNode.id, endNode.id, lines.length);
  };

  const keyActions = {
    'q': autoPaginate,
    't': handleWidescreen,
    'arrowup': prevParagraph,
    'arrowdown': nextParagraph,
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
    }
  };

  return (
    <>
      <DocRoot {...props} />
    </>
  );
}
