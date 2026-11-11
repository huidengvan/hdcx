
# Website

This website is built using [Docusaurus 3](https://docusaurus.io/), a modern static website generator.

### Installation

```
$ yarn
```

### Upgrade to latest docusaurus

```
yarn upgrade @docusaurus/core@latest @docusaurus/preset-classic@latest @docusaurus/module-type-aliases@latest
```

### Local Development

```
$ yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

# run it locally

## MacOS/ Linux
npm run start

## Windows
npm run dev

# check mdx 
npm run check

---

## 自定义组件说明

- theme/DocRoot refs等文档的根组件，添加了宽屏阅读等功能
- theme/Root 主程序的根组件，加入了Playlist组件，以实现后台播放
- components/Playlist 播放列表组件，route为 `/playlist`
- components/SubtitleContext 滚动播放字幕组件，是Playlist的子组件，有单独的route `/video`(禅修课的视频用)
- components/ReaderToolbar 阅读工具栏侧边浮动组件，支持主题切换、字号调整、段落号显隐
  
## 行号插件
位于`plugins/para-anchor`，插件运行在编译阶段，需要在config中引用。  
相较于在运行时动态插入行号，当有几千行的长文时，运行在手机等性能较差的设备上会更快。

## AI 语义搜索（RAG）

`/search` 页的「AI 搜索」检索 `rag/categories.json` 中列出的内容（目前为课程法本第一～四册、《慧灯之光》1~12 册、其他参考（`refs/misc`）、`refs/` 下 9 部参考资料、四册禅修课视频字幕 `static/docs/srts`），法本结果按段落号跳转原文，视频结果跳到对应时间播放。

**修改这些法本或字幕后必须更新索引**，否则搜索结果会跳错位置：

```bash
pnpm build
pnpm rag:update
```

需要 Cloudflare 与 Qdrant 凭据（`.env.local`）；没有权限的协作者提交后告知维护者即可。完整说明见 [rag/README.md](rag/README.md) 第 0 节。

## 关键词搜索

`/search` 页的「关键词搜索」按字面检索四册禅修课视频字幕（`static/docs/srts/b1~b4`）、课程法本（`books/b1~b4`）与 `refs` 下的文章（《慧灯之光》、其他参考、参考资料，不含传承传记与喇荣课诵），视频字幕与课程法本合为「慧灯禅修课」一个筛选项（AI 搜索同样）。接口为 `workers/fayu-api`（Cloudflare Worker + D1 数据库 `fayu`）。**修改字幕、课程法本或 refs 文章后须重新导入数据库**（文章取自构建产物）：

```bash
pnpm build
pnpm fayu:import
```

需要 wrangler 已登录（`wrangler login`）。匹配规则、表结构与部署说明见 [workers/fayu-api/README.md](workers/fayu-api/README.md)。

## 使用文档

### 文档阅读页 快捷键（不分大小写）

- `⬅️（左键）` 翻到上一页
- `➡️（右键）` 翻到下一页
- `T` 宽屏阅读开关，进入时放大字号
- `L` 段落号显隐开关
- `+` / `-` 放大 / 缩小字号，`0` 恢复默认字号
- 阅读工具栏（页面右侧）：主题切换、字号调整、段落号显隐、宽屏模式切换

### 播放列表编辑
- 点击播放列表右侧的编辑（铅笔），进入编辑模式，再次点击应用
- 格式：视频地址^起始时间@显示标题 每个视频一行，编辑好再点一下铅笔图标。
- 当有很多条视频时，可在地址栏传入uri参数，指向一个txt文本的地址，文本格式同上
- 播放列表会自动下一曲，播完某个视频需要暂停时，在下边添加一条`blank`视频，如`blank@研究讨论`

### 禅修课视频 同步字幕播放

播放页有两种地址，都可以在末尾加 `#t=秒数` 定位到时间点（如 `#t=62.44`，或 `#t=开始,结束` 只播一段）。

**短地址**（推荐）：`/video/<册>/<册号>-<课号>[-第几个视频]`，写法与法本 `/books/b1/1-01` 一致。

| 短地址 | 对应网盘文件 |
|---|---|
| `/video/b1/1-01` | 慧灯禅修课第一册/01 三个差别(2014).mp4 |
| `/video/b1/1-02` | 慧灯禅修课第一册/02-1 三殊胜（上）.mp4（省略最后一段取该课第一个视频） |
| `/video/b1/1-02-3` | 慧灯禅修课第一册/02-3 三殊胜（下）.mp4 |
| `/video/b3/3-01#t=62.44` | 慧灯禅修课第三册/01 慧灯禅修课1 入坐与出坐.mp4，从 62.44 秒开始 |

- `b1`~`b4` 对应网盘 `禅修课视频/慧灯禅修课第一册`~`第四册`，这个对应关系写在 `src/components/SubtitleContext/videoAlias.js`。
- 课号和“第几个视频”取自**网盘文件名开头的编号**（`02-1 三殊胜（上）.mp4` → `02-1`），页面打开时调 Alist 接口 `box.hdcxb.net/api/fs/list` 现查，代码里不保存文件名。所以网盘里新增、改名视频后短地址自动跟着变，不用改代码；课号是网盘的编号，不一定等于法本的课号（第三册 `3-00` 是“介绍慧灯禅修”）。
- 编号重复的文件只有网盘里排在前面的那个有短地址，没有编号的文件（如“梦幻世界”）没有短地址，这两种继续用完整地址。
- 同一课（开头两位课号相同）有多个视频时，播放页标题变成下拉菜单，可以直接切换。
- 不存在的地址显示 404 页。
- 复制时间点链接、搜索结果里的视频链接会自动用短地址。

**完整地址**：`/video#第几册/文件名.mp4`，文件名必须和网盘中的名字相同，例如  
`/video#慧灯禅修课第四册/01-3%20慧灯禅修课23%20加行的修法-皈依3.mp4`

**路由**：`/video` 及其下所有地址由 `docusaurus.config.js` 里的 `video-route` 插件交给同一个页面（`src/components/SubtitleContext/VideoPage.jsx`），短地址在浏览器里解析。短地址没有对应的静态文件，线上靠 `static/_redirects`（Netlify）把 `/video/*` 重写到 `/video/index.html`；换托管平台时要配置等价的重写规则。

字幕取自本站 `static/docs/srts/b1~b4`，文件名与视频相同。
