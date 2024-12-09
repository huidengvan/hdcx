import React from 'react';
import ColorModeToggle from '@theme-original/Navbar/ColorModeToggle';
import { useHistory } from '@docusaurus/router';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state'
import { useLocation } from '@docusaurus/router';

export default function ColorModeToggleWrapper(props) {
  const history = useHistory();
  const [playlist,] = useLocalStorageState('playlist')
  const location = useLocation();

  const switchShowList = () => {
    if (location.pathname != '/playlist') {
      history.push('/playlist')
    } else if (history.length > 2) {
      history.goBack()
    }
  }

  return (
    <>
      <ColorModeToggle {...props} />
      {playlist &&
        <button className={styles.playBtn} type='button' title='切换到 播放列表/之前访问 的页面' onClick={switchShowList}>
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#414141"><path d="M640-160q-50 0-85-35t-35-85q0-50 35-85t85-35q11 0 21 1.5t19 6.5v-328h200v80H760v360q0 50-35 85t-85 35ZM120-320v-80h320v80H120Zm0-160v-80h480v80H120Zm0-160v-80h480v80H120Z" /></svg>
        </button>
      }
    </>
  );
}
