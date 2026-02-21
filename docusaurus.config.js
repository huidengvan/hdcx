// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';
import paraAnchor from './src/plugins/para-anchor.js';

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: '禅修班',
    tagline: '学修指南及参考课程进度安排',
    url: 'https://huidengchanxiu.net',
    baseUrl: '/',
    onBrokenLinks: 'ignore',
    onBrokenMarkdownLinks: 'ignore',
    favicon: 'img/favicon.ico',
    organizationName: 'huidengvan', // Usually your GitHub org/user name.
    projectName: 'huidengchanxiu', // Usually your repo name.
    i18n: {
        defaultLocale: 'zh-Hans',
        locales: ['zh-Hans'],
    },

    presets: [
        [
            'classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    sidebarPath: './sidebars.js',
                },

                theme: {
                    customCss: './src/css/custom.css',
                },
            }),
        ],
    ],
    plugins: [
        [
            '@docusaurus/plugin-content-docs',
            {
                id: 'wsb',
                path: 'wsb',
                routeBasePath: 'wsb',
                sidebarPath: require.resolve('./sidebars.js'),
                rehypePlugins: [paraAnchor],
            },
        ],
        [
            '@docusaurus/plugin-content-docs',
            {
                id: 'books',
                path: 'books',
                routeBasePath: 'books',
                sidebarPath: require.resolve('./sidebars.js'),
                rehypePlugins: [paraAnchor],
            },
        ],
        [
            '@docusaurus/plugin-content-docs',
            {
                id: 'refs',
                path: 'refs',
                routeBasePath: 'refs',
                sidebarPath: require.resolve('./sidebars.js'),
                rehypePlugins: [paraAnchor],

            },
        ],
        [
            '@docusaurus/plugin-content-docs',
            {
                id: '4jx',
                path: '4jx',
                routeBasePath: '4jx',
                sidebarPath: require.resolve('./sidebars.js'),
                rehypePlugins: [paraAnchor],
            },
        ],
        [
            '@docusaurus/plugin-content-docs',
            {
                id: '5jx',
                path: '5jx',
                routeBasePath: '5jx',
                sidebarPath: require.resolve('./sidebars.js'),
                rehypePlugins: [paraAnchor],
            },
        ],
        [
            '@docusaurus/plugin-content-docs',
            {
                id: 'wenda',
                path: 'wenda',
                routeBasePath: 'q&a',
                sidebarPath: require.resolve('./sidebars.js'),
            },
        ],
    ],
    themes: [],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    {
        docs: {
            sidebar: {
                hideable: true,
                autoCollapseCategories: true,
            },
        },
        // algolia: {
        //     // Algolia 提供的应用 ID
        //     appId: 'YZCX64HE2F',
        //     //  公开 API 密钥：提交它没有危险
        //     apiKey: '9da5cd9155e50fff844a06f84e3ee642',
        //     indexName: 'hdcx',
        //     // 可选：见下文
        //     contextualSearch: false,
        //     // 可选: Algolia 搜索参数
        //     searchParameters: {},
        //     // 可选: 搜索页面的路径，默认启用(可用`false`禁用)
        //     searchPagePath: 'search',
        // },
        navbar: {
            title: '禅修班',
            logo: {
                alt: 'HuidengVan',
                src: 'img/hdlogo.png',
            },
            hideOnScroll: true,
            items: [
                {
                    type: 'doc',
                    docId: 'intro',
                    position: 'left',
                    label: '学修指南',
                },
                {
                    type: 'doc',
                    docId: 'b1/1-01',
                    docsPluginId: 'books',
                    position: 'left',
                    label: '课程法本',
                },
                {
                    type: 'doc',
                    docId: 'index',
                    docsPluginId: 'refs',
                    position: 'left',
                    label: '参考法本',
                },
                {
                    type: 'doc',
                    docId: 'book1',
                    docsPluginId: 'wsb',
                    position: 'left',
                    label: '闻思班',
                },
                {
                    type: 'doc',
                    docId: '1xm',
                    docsPluginId: '4jx',
                    position: 'left',
                    label: '四加行',
                },
                {
                    type: 'doc',
                    docId: '1gy',
                    docsPluginId: '5jx',
                    position: 'left',
                    label: '五加行',
                },
                {
                    href: 'https://sou.hdcxb.net',
                    label: '法语搜索',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'light',
            links: [
                {
                    title: 'Docs',
                    items: [
                        {
                            label: '学修指南',
                            to: '/docs/intro',
                        },
                    ],
                },
                {
                    title: 'Links',
                    items: [
                        {
                            label: '慧灯小组温哥华',
                            href: 'https://www.huidengvan.com',
                        }
                    ],
                },
            ],
            copyright: `慧灯小组温哥华（huidengvan.com / huidengvan@gmail.com）发心制作. Built with Docusaurus. ${new Date().getFullYear()} `,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    },
    // webpack: {
    //     jsLoader: (isServer) => ({
    //         loader: require.resolve('esbuild-loader'),
    //         options: {
    //             loader: 'jsx',
    //             format: isServer ? 'cjs' : undefined,
    //             target: isServer ? 'node12' : 'es2017',
    //         },
    //     }),
    // },

};

export default config;
