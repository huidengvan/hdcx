import React, { useEffect } from 'react';
import Navbar from '@theme-original/Navbar';
import { useLocation } from '@docusaurus/router';
import styles from './index.module.css';

export default function NavbarWrapper(props) {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(decodeURI(location.hash.slice(1)));
      element && element.scrollIntoView();
    }
  }, [location]);

  return (
    <div className={styles.wrapper}>
      <Navbar {...props} />
      <audio src='https://s3.ap-northeast-1.wasabisys.com/hdcx/hdv/a/恒常念诵愿文.mp3' controls />
    </div>
  );
}
