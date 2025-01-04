
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

- theme/DocRoot refs等文档的根组件，添加了背景切换、自动翻页等
- theme/Navbar 导航栏，加入了后台播放的图标
- theme/Root 主程序的根组件，加入了Playlist组件，以实现后台播放
- components/Playlist 播放列表组件，route为 `/playlist`
- components/SubtitleContext 滚动播放字幕组件，是Playlist的子组件，有单独的route `/video`(禅修课的视频用)
  
## 行号插件
位于`plugins/para-anchor`，插件运行在编译阶段，需要在config中引用。  
相较于在运行时动态插入行号，当有几千行的长文时，运行在手机等性能较差的设备上会更快。

## 使用文档

### 文档阅读页 快捷键（不分大小写）

- `⬅️（左键）` 翻到上一页
- `➡️（右键）` 翻到下一页
- `Alt + B` 切换背景色
- `Alt + T` 宽屏阅读，放大字号
- `Alt + ⬆️（上键）` 定位到上一段（仅自动阅读时生效）
- `Alt + ⬇️（下键）` 定位到下一段（仅自动阅读时生效）
- 双击阅读区域，进入全屏（手机可用）

### 播放列表编辑
- 点击播放列表右侧的编辑（铅笔），进入编辑模式，再次点击应用
- 格式：视频地址^起始时间@显示标题 每个视频一行，编辑好再点一下铅笔图标。
- 当有很多条视频时，可在地址栏传入uri参数，指向一个txt文本的地址，文本格式同上
- 播放列表会自动下一曲，播完某个视频需要暂停时，在下边添加一条`blank`视频，如`blank@研究讨论`

### 禅修课视频 同步字幕播放
/video#第几册/第几课，需要注意文件名和网盘中的名字必须相同，格式如下：  
`/video#慧灯禅修课第四册/01-3%20慧灯禅修课23%20加行的修法-皈依3.mp4)`