import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from '@docusaurus/router';
import DocRoot from '@theme-original/DocRoot';
import { locateParagraph } from '@site/src/utils'
import useLocalStorageState from 'use-local-storage-state';
import ReaderToolbar from '../../components/ReaderToolbar';

export default function DocRootWrapper(props) {
  const location = useLocation();

  const [currentPara] = useLocalStorageState('currentPara')
  const [isWidescreen, setIsWidescreen] = useState(false);

  useEffect(() => {
    const articleTitle = decodeURI(location.hash?.slice(1))
    if (articleTitle) {
      locateParagraph(articleTitle)
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dblclick', handleFullscreen);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dblclick', handleFullscreen);
    };
  }, []);

  useEffect(() => {
    const hash = decodeURI(location.hash?.slice(1));
    if (hash) {
      locateParagraph(hash);
    }
  }, [location.hash, location.pathname]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = decodeURI(window.location.hash?.slice(1));
      if (hash) {
        locateParagraph(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    locateParagraph(currentPara);
  };

  const handleWidescreen = useCallback(() => {
    const articleCol = document.querySelector('article')?.parentElement?.parentElement;
    if (!articleCol) return;
    const tocNode = document.querySelector('.theme-doc-toc-desktop');

    if (articleCol.className === '') {
      if (tocNode) tocNode.style.display = '';
      articleCol.className = 'col docItemCol_node_modules-@docusaurus-theme-classic-lib-theme-DocItem-Layout-styles-module';
      articleCol.style.fontSize = '';
      setIsWidescreen(false);
    } else {
      if (tocNode) tocNode.style.display = 'none';
      articleCol.className = '';
      articleCol.style.fontSize = 'x-large';
      setIsWidescreen(true);
    }

    const sidebarButton = document.querySelector('[class*="collapseSidebarButton"]');
    sidebarButton?.click();

    setTimeout(() => {
      locateParagraph(currentPara);
    }, 200);
  }, [currentPara]);

  const keyActions = {
    't': handleWidescreen,
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
      <ReaderToolbar
        onToggleWidescreen={handleWidescreen}
        isWidescreen={isWidescreen}
      />
      <DocRoot {...props} />
    </>
  );
}
