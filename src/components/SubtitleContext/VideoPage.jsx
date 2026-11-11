import React, { useState } from 'react';
import Layout from '@theme/Layout';
import NotFoundContent from '@theme/NotFound/Content';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import SubtitleContext from './index';
import { parseAliasPath } from './videoAlias';
import styles from './index.module.css';

// /video 与 /video/b1/1-01 共用的页面，路由在 docusaurus.config.js 的 video-route 插件里注册
export default function VideoPage() {
    const { pathname } = useLocation();
    const videoBase = useBaseUrl('/video');
    // 短地址写对了、但那一册里没有这个编号时，由播放器查完目录后通知
    const [missingPath, setMissingPath] = useState(null);

    // 这个路由会接住 /video/ 下的任何地址：既不是 /video 本身、也不是 b1~b4 短地址的，按 404 处理
    const rest = pathname.slice(videoBase.length).replace(/\/$/, '');
    const notFound = (rest !== '' && !parseAliasPath(pathname)) || missingPath === pathname;

    if (notFound) {
        return (
            <Layout>
                <NotFoundContent />
            </Layout>
        );
    }

    return (
        // 不要页脚；桌面端 videoPage 固定铺满导航栏以下的整屏，页面本身不滚动
        <Layout noFooter>
            <main className={styles.videoPage}>
                <SubtitleContext onNotFound={() => setMissingPath(pathname)} />
            </main>
        </Layout>
    );
}
