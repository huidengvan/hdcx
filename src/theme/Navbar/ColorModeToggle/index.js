import React from 'react';
import ColorModeToggle from '@theme-original/Navbar/ColorModeToggle';
import { useHistory } from '@docusaurus/router';
import styles from './index.module.css';
import useLocalStorageState from 'use-local-storage-state'

export default function ColorModeToggleWrapper(props) {
  const history = useHistory();
  const [playlist,] = useLocalStorageState('playlist')
  const [playInfo,] = useLocalStorageState('playInfo')

  const switchShowList = () => {
    if (location.pathname != '/playlist') {
      history.push('/playlist')
    } else {
      history.goBack()
    }
  }

  return (
    <>
      <ColorModeToggle {...props} />
      {playlist &&
        <button className={styles.playBtn} type='button' onClick={switchShowList}>
          {playInfo?.paused ?
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.svg} width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M12 13c0 1.105-1.12 2-2.5 2S7 14.105 7 13s1.12-2 2.5-2 2.5.895 2.5 2" />
              <path fillRule="evenodd" d="M12 3v10h-1V3z" />
              <path d="M11 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 16 2.22V4l-5 1z" />
              <path fillRule="evenodd" d="M0 11.5a.5.5 0 0 1 .5-.5H4a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 7H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 3H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5" />
            </svg> :
            <svg xmlns="http://www.w3.org/2000/svg" className={styles.svg} width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8.5 2a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-1 0v-11a.5.5 0 0 1 .5-.5m-2 2a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5m4 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5m-6 1.5A.5.5 0 0 1 5 6v4a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m8 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m-10 1A.5.5 0 0 1 3 7v2a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5m12 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5" />
            </svg>}
        </button>
      }
    </>
  );
}
