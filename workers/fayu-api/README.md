# 关键词搜索 API（fayu-api）

`/search` 页「关键词搜索」的后端：Cloudflare Worker `fayu-worker`（域名 `fayuapi.hdcxb.net`）+ D1 数据库 `fayu`。

| 分类 | `c` | 来源 |
| :--- | :--- | :--- |
| 课程视频 | `video` | `static/docs/srts/b1~b4` 的字幕（目录与册名取自 `rag/categories.json` 中 `type: "srt"` 的分类） |
| 慧灯之光 | `hdzg` | `refs/hdzg/01~12`，每册按二级标题拆成文章 |
| 其他参考 | `misc` | `refs/misc` |
| 参考资料 | `refs` | `refs` 下其余目录；**不含**传承传记（`refs/cczj`）与喇荣课诵（`refs/lrksj.md`） |

文章取自构建产物 `build/refs` 的 HTML（与 AI 搜索共用 `rag/scripts/build-chunks.mjs` 的段落抽取），段落号与线上 `#pN` 锚点一致；目录与密法折叠内容同样跳过。

由原独立仓库 `fayu_search`（Preact 前端 + `fayu-worker` 子模块 + SQL 生成脚本）重构迁入；前端已并入本站 `src/components/Search`。

## 0. 常用命令（仓库根目录）

```bash
pnpm fayu:install          # 首次：安装 wrangler 等依赖
pnpm build                 # 文章取自 build/refs，导入前须先构建
pnpm fayu:import           # 字幕或 refs 改动后：重新生成并导入远程 D1（清空旧数据后整体写入）
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
| 规范化 | 正文与查询都去掉空白和标点、全角转半角、英文转小写、繁体转简体（`src/normalize.js`），因此语音转写里的“一 切众生”、繁体输入“眾生”都能命中 |
| 跨行 | 视频字幕拼成一整串再查找，被切在相邻两条字幕里的一句话也能搜到；文章段落之间有分隔，短语不跨段 |
| 多个词 | 空格（或 `,，、;；/`）分隔；所有词都出现在同一视频 / 同一篇文章中即命中。展示时优先显示在 `NEAR_CHARS`（80）字以内同时出现之处，块内没有则显示各词各自的出现处 |
| 包含关系 | 被其他词包含的词自动去掉，如“菩提 菩提心”只按“菩提心” |
| 排序 | 关键词出现次数多的在前，相同时按导入顺序（视频按册，文章按目录） |
| 展示 | 视频：命中行前后各 `CONTEXT_LINES`（1）行，每个视频最多 `MAX_LINES`（120）行；文章：命中段落，超过 `SNIPPET_CHARS`（160）字截取以关键词为中心的片段，每篇最多 `MAX_PARAS`（20）段；每个文档只取前 `MAX_BLOCKS_PER_DOC`（2）个命中块 |
| 筛选 | `c=video,hdzg` 按分类筛选；`facets` 返回各分类命中文档数（不受筛选影响），供前端显示筛选项 |
| 片尾 | 导入时去掉视频片尾的网站、微博、著作书单等（与 AI 搜索共用 `rag/scripts/srt-chunks.mjs` 的解析） |
| 长段落 | 超过 2000 字的段落（个别源文件漏了空行）按句拆成约 1500 字的几份，沿用同一段落号，份与份之间可跨接匹配 |
| 限制 | 查询最多 50 字、6 个词；块与块交界处的跨块短语搜不到，影响可忽略 |

相关参数在 `wrangler.toml` 的 `[vars]` 中调整。

## 2. 接口

`GET /search?q=人身难得&page=1&size=10&c=hdzg`

```jsonc
{
  "q": "人身难得",
  "terms": ["人身难得"],             // 规范化后的关键词
  "total": 53,                       // 命中的文档数（筛选后）
  "matches": 119,                    // 关键词出现次数（筛选后）
  "facets": { "video": 32, "hdzg": 53, "misc": 10, "refs": 59 },
  "page": 1, "pageSize": 10, "tookMs": 160,
  "results": [
    {
      "type": "article", "cat": "hdzg", "group": "refs/hdzg/02", "groupLabel": "慧灯之光二",
      "title": "加行的修法--人身难得", "url": "/refs/hdzg/02", "count": 7,
      "groups": [[ { "p": 138, "text": "外加行中，第一个修法是人身难得……", "hit": true, "hl": [[12, 16]], "tail": true } ]]
    },
    {
      "type": "video", "cat": "video", "group": "b3", "groupLabel": "第三册", "series": "慧灯禅修课第三册",
      "title": "03-1 慧灯禅修课6 寿命无常1", "count": 3,
      "groups": [[ { "n": 31, "t": 146, "text": "前面我们已经讲过了人身难得", "hit": true, "hl": [[9, 13]] } ]]
    }
  ]
}
```

- 视频行：`n` 字幕序号（从 1 起，去掉片尾后重新编号）、`t` 开始时间（秒）
- 文章行：`p` 段落号（跳转 `{url}?hl={p}-{p}#p{p}`）、`head` / `tail` 表示片段前后有省略
- `hl`：高亮区间（`text` 内下标 `[起, 止)`）
- `GET /meta`：数据版本、导入时间、各分类文档数
- `GET /search/:keyword/:page`：旧接口，只搜视频，返回旧格式（`subtitles` 为 JSON 字符串），供尚未更新的旧前端使用，确认没有调用后可删除

## 3. 表结构（`schema.sql`）

| 表 | 内容 |
| :--- | :--- |
| `docs` | 每个视频 / 每篇文章一行：`cat`、`grp`（b1~b4 / refs/qxgs 等）、`grp_label`、`title`、`series`（视频）、`url`（文章）、`units` |
| `block_norms` | 检索用：连续若干条字幕 / 段落的规范化文本拼成一块（约 90KB），`norm_lens` 为各条长度 |
| `block_texts` | 展示用：与 `block_norms` 一一对应，`marks`（视频开始毫秒 / 文章段落号）、`texts`（原文） |
| `meta` | `version`（数据内容哈希）、`updated_at` |

约 380 篇、1100 块，库约 170MB（免费计划单库上限 500MB）。

为什么这样存：D1 免费额度每天读 500 万行、写 10 万行，按行计数而不论行多大。

- 逐行存储（字幕 11.7 万条、段落 26 万段）写入就超过每天的写入额度，搜索时 `LIKE` 全表扫描读的行数也太多（旧版只存字幕，每次搜索读约 24 万行，一天二十来次就用完）
- 打包成大块后每次搜索只扫约 1100 行（`block_norms` 全表），一天约可搜 4500 次（不含命中边缘缓存的重复查询）
- 规范化文本与原文分表：扫描时只读规范化文本那张表，行数约为同表存放的一半；原文只按主键取当前页要显示的块
- 只取当前页每个文档的前 2 个命中块，限制传给 Worker 的数据量（免费计划每次请求 CPU 10ms）

检索分两步（`src/index.js`）：

1. SQL 用 `instr` / `replace` 统计各文档每个词的出现次数，要求每个词都出现 → 排序、分页、各分类统计
2. 一次往返取回当前页文档的元数据与前 2 个命中块，在 JS 中定位命中行、取上下文、计算高亮与片段（`src/search.js`）

## 4. 待补字幕

以下视频在网盘（`box.hdcxb.net/禅修课视频/`）中有，但还没有字幕，关键词搜索与播放器字幕面板都不包含它们（2026-11-01 核对）：

| 册 | 视频 |
| :--- | :--- |
| 第一册 | 10 麦彭仁波切对初学者的教诲 |
| 第二册 | 10-3 开示四谛（三） |
| 第二册 | 10-4 开示四谛（四） |
| 第二册 | 为什么现代人越来越没有幸福感 |
| 第二册 | 佛教的世界观01 |
| 第二册 | 佛教的世界观02 |

补字幕时：文件名须与视频文件名完全相同（扩展名改为 `.srt`），放入 `static/docs/srts/b1`、`b2`，然后执行 `pnpm fayu:import`（关键词搜索）与 `pnpm build` → `pnpm rag:update`（AI 搜索）。播放器（`src/components/SubtitleContext`）直接读取该目录，无需另外处理。

## 5. 繁简映射

`src/t2s.js` 由 `pnpm --dir workers/fayu-api --ignore-workspace t2s`（`scripts/gen-t2s.mjs`，基于 opencc-js）生成：台湾、香港、OpenCC 标准繁体的单字一对一映射，约 3600 字。重新生成后须重新导入并部署。
