# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2026-10-21]

### Added
- 新增 `ReaderToolbar` 阅读工具栏侧边浮动组件：支持 5 款背景/文字主题切换、字号实时加减调节、段落号一键显隐与宽屏模式切换，收起状态采用小巧半透明 A 按钮设计
- 新增法语搜索功能模块及独立页面（`src/components/Search/` 与 `src/pages/search.jsx`）

### Changed
- 重构 `SubtitleContext` 媒体播放与同步字幕组件：采用现代双栏响应式设计、优化活跃字幕左侧高亮与滚动跟随、增加时间戳定位复制提示、规范居中对齐图标
- 重构 `Playlist` 播放列表组件：卡片化布局、当前播放曲目动态音波动效、总时长与讲数徽章展示、集成友好的列表编辑抽屉
- 全面适配深色模式：优化目录展开折叠框（`<details>`/`<summary>`）及其三角箭头样式，避免高眩光并完美融入夜间墨主题
- 优化顶部导航栏：将「法语搜索」文字链接替换为主题自适应的放大镜搜索图标，移除右侧多余的播放列表图标按钮

### Fixed
- 修复 iOS 竖屏下视频播放自动全屏问题（补充 `<video>` 的 `playsInline` 及移动端属性，清理冗余的 `requestFullscreen` 调用）
- 优化移动端同步字幕显示高度与排版：由固定 380px 调整为动态 60dvh（最小 480px），可同时展示 10+ 行字幕；改进自动居中滚动避免触发整页跳动
- 修复移动端视频与字幕卡片左侧无边距、右侧外溢不对齐的问题（重置 MDX 包装层负外边距并显式声明标准盒模型）
- 修复移动端侧边抽屉菜单中多余的孤立搜索图标（仅保留顶部栏常驻搜索按钮）
- 调整生产构建堆内存上限为 6144MB，优化 CI / Cloudflare Pages 环境下的内存安全边际

### Removed
- 移除 `DocRoot` 与 `utils` 中废弃的自动阅读相关逻辑与悬浮控制
- 移除 `SubtitleContext` 和 `Playlist` 中已不再使用的入行论专用时间跳转与特殊扣减逻辑
- 移除视频播放标题栏的倍速控制按钮及播放倍速快捷键（`Alt -` / `Alt =` / `Alt 0`）

## [2026-10-20]

### Fixed
- 适配 Docusaurus v3 配置规范（迁移 `onBrokenMarkdownLinks` 至 `markdown.hooks` 并添加 `onBrokenAnchors`）
- 添加 `@docusaurus/types` 开发依赖，解决配置文件的 TypeScript 类型定义解析报错
- 适配 pnpm 11 安全策略（添加 `pnpm-workspace.yaml` 与 `.npmrc`），解决 CI 环境下因 `core-js` 等构建脚本导致的安装报错

