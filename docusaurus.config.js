// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '慧灯禅修班',
  tagline: '学修指南及参考课程进度安排',
  url: 'https://huidengchanxiu.net',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'huidengvan', // Usually your GitHub org/user name.
  projectName: 'huidengchanxiu', // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          routeBasePath: 'docs',
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          // editUrl:
          //   'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        // blog: {
        //   showReadingTime: true,
        //   // Please change this to your repo.
        //   // Remove this to remove the "edit this page" links.
        //   // editUrl:
        //   //   'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        // },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
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
        // ... other options
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'books',
        path: 'books',
        routeBasePath: 'books',
        sidebarPath: require.resolve('./sidebars.js'),
        // ... other options
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'refs',
        path: 'refs',
        routeBasePath: 'refs',
        sidebarPath: require.resolve('./sidebars.js'),
        // ... other options
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: '4jx',
        path: '4jx',
        routeBasePath: '4jx',
        sidebarPath: require.resolve('./sidebars.js'),
        // ... other options
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: '5jx',
        path: '5jx',
        routeBasePath: '5jx',
        sidebarPath: require.resolve('./sidebars.js'),
        // ... other options
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

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
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
          {
            to: '/q&a/十个怎么办',
            label: '答疑',
            position: 'left'
          },
          // {to: '/blog', label: 'Blog', position: 'left'},
          {
            href: 'https://sou.hdcxb.net',
            label: '法语搜索',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
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
            title: '法本',
            items: [
              {
                label: '第一册',
                to: '/books/b1/',
              },
            ],
          },

          // {
          //   title: 'More',
          //   items: [
          //     {
          //       label: 'Blog',
          //       to: '/blog',
          //     },

          //   ],
          // },
        ],
        copyright: `慧灯小组温哥华（huidengvan.com / huidengvan@gmail.com）发心制作. Built with Docusaurus. ${new Date().getFullYear()} `,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
      algolia: {
        // Algolia 提供的应用 ID
        appId: 'YZCX64HE2F',
        //  公开 API 密钥：提交它没有危险
        apiKey: '9da5cd9155e50fff844a06f84e3ee642',
        indexName: 'hdcx',
        // 可选：见下文
        contextualSearch: false,
        // 可选：声明哪些域名需要用 window.location 型的导航而不是 history.push。 适用于 Algolia 配置会爬取多个文档站点，而我们想要用 window.location.href 在它们之间跳转时。
        // externalUrlRegex: 'external\\.com|domain\\.com',
        // 可选: Algolia 搜索参数
        searchParameters: {},

        // 可选: 搜索页面的路径，默认启用(可用`false`禁用)
        searchPagePath: 'search',
      },
    }),

  // plugins: ['@aldridged/docusaurus-plugin-lunr'],
  // themes: [
  //   // ... Your other themes.
  //   [
  //     require.resolve("@easyops-cn/docusaurus-search-local"),
  //     {
  //       // ... Your options.
  //       // `hashed` is recommended as long-term-cache of index file is possible.
  //       hashed: true,
  //       // For Docs using Chinese, The `language` is recommended to set to:
  //       // ```
  //       // language: ["en", "zh"],
  //       // ```
  //     },
  //   ],
  // ],
};

module.exports = config;
