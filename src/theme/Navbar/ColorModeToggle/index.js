import React from 'react';
import { useColorMode, useThemeConfig } from '@docusaurus/theme-common';
import ColorModeToggle from '@theme/ColorModeToggle';
import styles from './index.module.css';

export default function ColorModeToggleWrapper({ className }) {
  const navbarStyle = useThemeConfig().navbar?.style;
  const colorModeConfig = useThemeConfig().colorMode || {};
  const { disableSwitch, respectPrefersColorScheme } = colorModeConfig;
  const { colorModeChoice, setColorMode } = useColorMode();

  if (disableSwitch) {
    return null;
  }

  const handleColorModeChange = (newMode) => {
    try {
      // 切换模式（夜间/白天）时，阅读主题均重置为默认（索引 0: 默认白）
      // 夜间模式下全站将全面使用夜间的文字、背景、导航栏、卡片和底部
      localStorage.setItem('readerThemeIndex', '0');
      localStorage.setItem('readerTheme', 'white');
      localStorage.setItem('bgColorIndex', '0');
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-reader-theme', 'white');
      }
      window.dispatchEvent(new CustomEvent('reader-theme-change', { detail: { index: 0, id: 'white' } }));
    } catch (e) {
      console.error(e);
    }

    setColorMode(newMode);
  };

  return (
    <ColorModeToggle
      className={className}
      buttonClassName={
        navbarStyle === 'dark' ? styles.darkNavbarColorModeToggle : undefined
      }
      respectPrefersColorScheme={respectPrefersColorScheme}
      value={colorModeChoice}
      onChange={handleColorModeChange}
    />
  );
}
