// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';
import paraAnchor from './src/plugins/para-anchor.js';

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: '慧灯禅修班',
    tagline: '学修指南及参考课程进度安排',
    url: 'https://huidengchanxiu.net',
    baseUrl: '/',
    onBrokenLinks: 'warn',
    onBrokenMarkdownLinks: 'warn',
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
    ],
    themes: [],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    {
        navbar: {
            title: '慧灯禅修',
            logo: {
                alt: 'HuidengVan',
                src: 'img/hdlogo.png',
            },
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
                    title: 'Community',
                    items: [
                        {
                            label: 'markmap',
                            href: '/markmap',
                        }
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
    webpack: {
        jsLoader: (isServer) => ({
            loader: require.resolve('esbuild-loader'),
            options: {
                loader: 'jsx',
                format: isServer ? 'cjs' : undefined,
                target: isServer ? 'node12' : 'es2017',
            },
        }),
    },

};

export default config;
