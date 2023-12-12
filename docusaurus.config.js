import { themes } from 'prism-react-renderer';
import paraAnchor from './src/plugins/para-anchor.js';

const lightTheme = themes.github;
const darkTheme = themes.dracula;

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
        rehypePlugins: [paraAnchor],
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
        rehypePlugins: [paraAnchor],
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
        // generate paragraph anchor plugin
        rehypePlugins: [paraAnchor],

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
        rehypePlugins: [paraAnchor],
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
        rehypePlugins: [paraAnchor],
        // ... other options
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
          // {to: '/blog', label: 'Blog', position: 'left'},
          // {
          //   href: 'https://github.com/facebook/docusaurus',
          //   label: 'GitHub',
          //   position: 'right',
          // },
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
        theme: lightTheme,
        darkTheme: darkTheme,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
    }),

  scripts: [{ src: '/js/global.js', async: false, },],
  themes:
    // ... Your other themes.
    ['docusaurus-theme-search-typesense'],
  themeConfig: {
    typesense: {
      // Replace this with the name of your index/collection.
      // It should match the "index_name" entry in the scraper's "config.json" file.
      typesenseCollectionName: 'dev',

      typesenseServerConfig: {
        nodes: [
          {
            host: 'search.huidengchanxiu.net',
            port: 443,
            protocol: 'https',
          },
        ],
        apiKey: 'FnBBEeF2xFuSPtVhHc5U8GR6uOl7Q9W9FXdpm1qANCUhedzY',
      },

      // Optional: Typesense search parameters: https://typesense.org/docs/0.24.0/api/search.html#search-parameters
      typesenseSearchParameters: {},

      // Optional
      contextualSearch: true,
    }
  }
};

module.exports = config;
