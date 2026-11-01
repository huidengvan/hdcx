# 字幕搜索 API（fayu-api）

`/search` 页「字幕搜索」的后端：Cloudflare Worker `fayu-worker`（域名 `fayuapi.hdcxb.net`）+ D1 数据库 `fayu`。
数据来自 `static/docs/srts/b1~b4`（目录与册名取自 `rag/categories.json` 中 `type: "srt"` 的分类）。

由原独立仓库 `fayu_search`（Preact 前端 + `fayu-worker` 子模块 + SQL 生成脚本）重构迁入；前端已并入本站 `src/components/Search`。

## 0. 常用命令（仓库根目录）

```bash
pnpm fayu:install          # 首次：安装 wrangler 等依赖
pnpm fayu:import           # 字幕改动后：重新生成并导入远程 D1（清空旧数据后整体写入）
pnpm fayu:import --local   # 导入本地 D1，配合 pnpm fayu:dev 本地调试
pnpm fayu:import --dry     # 只生成 out/import.sql，不导入
pnpm fayu:dev              # 本地运行 Worker（默认 http://127.0.0.1:8787，读本地 D1）
pnpm fayu:deploy           # 部署 Worker
```

导入后数据版本（内容哈希）随之改变，Worker 一分钟内发现新版本，结果缓存自动失效，**无需重新部署**。
只有改了 Worker 代码、`src/normalize.js` 或 `src/t2s.js` 才需要部署；改了后两者还须重新导入（库里存的规范化文本要与查询的规范化规则一致）。

## 1. 匹配规则

| 规则 | 说明 |
| :--- | :--- |
| 规范化 | 字幕与查询都去掉空白和标点、全角转半角、英文转小写、繁体转简体（`src/normalize.js`），因此语音转写里的“一 切众生”、繁体输入“眾生”都能命中 |
| 跨行 | 一个视频的字幕拼成一整串再查找，被切在相邻两条字幕里的一句话也能搜到（命中的每一行各自高亮） |
| 多个词 | 空格（或 `,，、;；/`）分隔；所有词在 `NEAR_CHARS`（80）字以内同时出现算一处匹配，约等于同一段话。旧版要求挤在同一条字幕（约 11 字）里，几乎搜不到 |
| 包含关系 | 被其他词包含的词自动去掉，如“菩提 菩提心”只按“菩提心” |
| 排序 | 匹配处数多的视频在前，相同时按课程顺序 |
| 展示 | 每处匹配取命中行前后各 `CONTEXT_LINES`（1）行，重叠或相邻的合并为一组；每个视频最多返回 `MAX_LINES`（120）行 |
| 筛选 | `b=b1,b3` 按册筛选；`facets` 返回各册匹配视频数（不受筛选影响），供前端显示筛选项 |
| 片尾 | 导入时去掉片尾的网站、微博、著作书单等（与 AI 搜索共用 `rag/scripts/srt-chunks.mjs` 的解析） |
| 限制 | 查询最多 50 字、6 个词；块与块交界处（约 190 处）的跨块短语搜不到，影响可忽略 |

相关参数在 `wrangler.toml` 的 `[vars]` 中调整。

## 2. 接口

`GET /search?q=菩提心 慈悲心&page=1&size=10&b=b1,b2`

```jsonc
{
  "q": "菩提心 慈悲心",
  "terms": ["菩提心", "慈悲心"],     // 规范化后的关键词
  "total": 23,                       // 匹配的视频数（筛选后）
  "matches": 89,                     // 匹配处数（筛选后）
  "facets": { "b1": 7, "b2": 2, "b3": 7, "b4": 7 },
  "page": 1, "pageSize": 10, "tookMs": 30,
  "results": [{
    "book": "b4", "series": "慧灯禅修课第四册", "title": "02-2 慧灯禅修课25 加行的修法-菩提心2", "count": 16,
    "groups": [[                       // 每组为连续的若干行
      { "n": 38, "t": 167, "text": "大乘佛教的这些经典" },
      { "n": 39, "t": 172, "text": "都有讲菩提心的功德", "hit": true, "hl": [[3, 6]] }
    ]]
  }]
}
```

- `n`：字幕序号（从 1 起，去掉片尾后重新编号）；`t`：开始时间（秒）；`hl`：高亮区间（原文下标 `[起, 止)`）
- `GET /meta`：数据版本、导入时间、各册视频数
- `GET /search/:keyword/:page`：旧接口，返回旧格式（`subtitles` 为 JSON 字符串），供尚未更新的旧前端使用，确认没有调用后可删除

## 3. 表结构（`schema.sql`）

| 表 | 内容 |
| :--- | :--- |
| `videos` | 每个视频一行：`id`、`book`（b1~b4）、`series`（播放器目录）、`title`（文件名）、`cues`、`duration` |
| `cue_blocks` | 视频中连续若干条字幕打包为一块（约 40KB）：`starts`（毫秒，逗号分隔）、`texts`（换行分隔）、`norm`（规范化文本拼接）、`norm_lens`（各条规范化长度） |
| `meta` | `version`（数据内容哈希）、`updated_at` |

为什么打包成块而不是一行一条字幕：D1 按读取行数计费，免费额度每天 500 万行。旧版逐行存储（11.7 万行）并用 `LIKE '%词%'` 全表扫描，每次搜索读约 24 万行，一天二十来次搜索就会用完；现在每次搜索 SQL 用 `instr` 扫约 260 个块，只取回当前页视频的命中块，Worker CPU 也很少（免费计划每次请求 10ms）。

检索分两步（`src/index.js`）：

1. 单个词由 SQL 直接统计各视频出现次数；多个词取回同时含全部词的块的 `norm`，在 JS 中判断距离并计数 → 排序、分页、各册统计
2. 取回当前页视频的命中块，在 JS 中定位命中行、取上下文、计算高亮（`src/search.js`）

## 4. 繁简映射

`src/t2s.js` 由 `pnpm --dir workers/fayu-api --ignore-workspace t2s`（`scripts/gen-t2s.mjs`，基于 opencc-js）生成：台湾、香港、OpenCC 标准繁体的单字一对一映射，约 3600 字。重新生成后须重新导入并部署。
