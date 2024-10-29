import React, { useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { ignoredCharacters, bgColors as colors, getTargetNode, locateParagraph, getStartNode, getRxlEndNode, filterFootnote } from '@site/src/utils/readingUtils.js'


export default function DocRootWrapper(props) {
  const location = useLocation();
  let docRoot, articleRef, duration, currentPara, endPara, autoPage, scrollY = 100;

  useEffect(() => {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const durationParam = urlParams.get('duration');
    articleRef = document.querySelector('article').parentElement.parentElement
    docRoot = document.querySelector('[class*=docRoot]')
    duration = parseInt(durationParam);

    if (duration) {
      autoPaginate();
    }

    const bgColorIndex = localStorage.getItem('bgColorIndex');
    if (bgColorIndex && articleRef) {
      docRoot.style.backgroundColor = colors[bgColorIndex].color;
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dblclick', handleFullscreen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    locateParagraph(currentPara, scrollY);
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
      articleRef.style.fontSize = 'xx-large'
    }

    let sidebarButton = document.querySelector('[class*="collapseSidebarButton"]')
    sidebarButton?.click()

    setTimeout(() => {
      locateParagraph(currentPara, scrollY);
    }, 10)
  };

  const prevParagraph = () => {
    if (currentPara === 1) return;
    currentPara -= 1;
    locateParagraph(currentPara - 1, scrollY);
    getTargetNode(currentPara).style.borderLeft = 'none'
  };

  const nextParagraph = () => {
    currentPara += 1;
    locateParagraph(currentPara + 1, scrollY);
    let node = getTargetNode(currentPara)
    if (node) {
      node.style.borderLeft = '1px solid #2e8555'
    }
  };

  const handleKeyDown = (event) => {
    if (event.altKey && (event.key === 'q' || event.key === 'Q')) {
      event.preventDefault();
      autoPaginate();
    } else if (event.altKey && (event.key === 't' || event.key === 'T')) {
      event.preventDefault();
      handleWidescreen();
    } else if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      prevParagraph();
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      nextParagraph();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      scrollY += 100;
      locateParagraph(currentPara, scrollY);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      scrollY -= 100;
      locateParagraph(currentPara, scrollY);
    } else if (event.altKey && (event.key === 'b' || event.key === 'B')) {
      const colorIndex = (Number(localStorage.getItem('bgColorIndex')) + 1) % colors.length;
      localStorage.setItem('bgColorIndex', colorIndex);
      docRoot.style.backgroundColor = colors[colorIndex].color;
    }
  };

  const autoNextParagraph = (speed) => {
    const targetNode = getTargetNode(currentPara);
    if (!targetNode || !autoPage || currentPara === endPara) {
      autoPage = false;
      console.log(autoPage, `自动阅读停止`);
      return;
    }
    const textLength = targetNode.lastChild?.textContent.replace(ignoredCharacters, '').length;
    const pagiTime = Math.round(textLength / speed);

    setTimeout(() => {
      nextParagraph();
      autoNextParagraph(speed);
    }, pagiTime * (localStorage.getItem('playbackRate') === '2' ? 500 : 1000));
  };

  const autoPaginate = async () => {
    autoPage = !autoPage;
    const speed = await calcAudioSpeed();

    console.log('read speed', speed);
    if (speed > 1) {
      autoNextParagraph(speed);
      handleWidescreen();

      console.log(`${autoPage ? '开始' : '暂停'}自动阅读`);
    }
  };

  const calcAudioSpeed = async () => {
    const startNode = getStartNode();
    let endNode = getRxlEndNode();
    if (!endNode || !duration) return -1;

    endNode = filterFootnote(endNode);
    if (startNode?.id) currentPara = parseInt(startNode.id?.slice(1));
    if (endNode?.id) endPara = parseInt(endNode.id?.slice(1));
    let totalWordCount = startNode.lastChild?.textContent.replace(ignoredCharacters, '').length;

    if (startNode && endNode) {
      let currentNode = startNode;
      while (currentNode && parseInt(currentNode?.id?.slice(1)) < parseInt(endNode?.id?.slice(1))) {
        totalWordCount += currentNode.lastChild?.textContent.replace(ignoredCharacters, '').length;
        currentNode = currentNode.nextElementSibling;
      }
      console.log({ totalWordCount, duration }, startNode.id, endNode.id);
      return Math.round(totalWordCount / duration * 1000) / 1000;
    }

    return -1;
  };

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(decodeURI(location.hash.slice(1)));

      element && element.scrollIntoView();
    }
  }, [location]);

  return (
    <>
      <DocRoot {...props} />
    </>
  );
}