# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [2026-10-26]

### Added
- 新增 `AudioCompanion` 伴读音频播放器系统（`src/components/AudioCompanion/`），支持文章内嵌音频伴读卡片（`SectionAudio`）与右侧贴边半露半透明悬浮播放球（`FloatingPodcastPlayer`）
- 在前行广释辅导 14 篇文档共 256 课标题下批量嵌入配套音频伴读组件
- 新增 `ReaderToolbar` 字体切换功能：支持系统默认、霞鹜文楷（LXGW WenKai）与仿宋字体按需动态加载切换
- 新增「藏红纸」禅修阅读主题，替换原淡黄纸主题，全站联动导航栏、侧边栏、卡片、折叠框与正文标题
- 新增 `SubtitleContext` 同步字幕骨架屏加载动效：加载中呈现柔和占位骨架屏；确认无字幕时自动隐藏字幕卡片并撑满播放器宽度
- 新增 `SubtitleContext` PC 端充满屏幕「宽屏」切换功能：支持无边距边缘贴合布局（左侧视频、右侧字幕）与默认宽模式自由切换

### Changed
- 优化音频伴读界面：精简为单一主控播放按钮，去除多余状态文字；重构播放控制按钮黄金比例
- 优化悬浮播放器体验：倍速与静音控件上移至标题栏，大幅压缩面板高度；收起时贴紧屏幕右边缘半露半透明展示（对齐主题调节 A 按钮风格），杜绝遮挡正文
- 统一音频前进与后退步长为 10 秒，替换为规范的 Google Material 图标
- 更新项目规范 `AGENTS.md`：确立构建与检查轻量化原则，严禁日常开发随意触发全量 Build/Lint，统一在代码提交时集中验证
- 重构 `ReaderToolbar` 主题色块选中视觉：去除厚重绿色外环，升级为精致微边框内环与优雅居中对勾（`✓`）
- 优化目录与折叠框（`<details>`/`<summary>`）三角箭头对齐与边距，消除视觉歪斜

### Fixed
- 修复移动端触控点击按钮后永久残留 Hover 激活状态的问题，将悬停样式限制在桌面端并添加瞬时触控缩放反馈
- 修复 `dev.config.js` 中缺失 `esbuild-loader` 依赖导致的本地启动报错
- 修复首页 Hero 区域标题「禅修班」在白色主题下被全局变量影响变为黑色的问题，确保首页大字始终纯白高亮
- 修复大字号下使用键盘左右方向键（`ArrowLeft` / `ArrowRight`）翻页时错误高亮屏幕外段落的 Bug，翻页后精准聚焦定位当前视口段落
- 修复进入宽屏模式后再点击 `A+` 按钮字号反而缩小还原的 Bug，实现字号在宽屏基准上的无缝递增
- 修复切换宽屏模式时阅读位置跳跃的问题，重排后自适应复位至当前正在阅读的段落
- 修复点击段落锚点高亮触发时文字发生轻微位移跳动的问题

### Removed
- 移除阅读区域双击进入全屏的功能与事件监听，并从 README 中清理对应快捷键条目

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
- 优化移动端同步字幕显示高度与排版：由固定 380px 调整为动态 60dvh（最小 480px），可同时展示 10+ 行字幕；改进自动跟随滚动避免触发整页跳动
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

