# AI 语义搜索（RAG 检索）

> 接口：`https://ragapi.hdcxb.net`（Cloudflare Worker `hdcx-rag-api`，备用 `https://hdcx-rag-api.huidengvan.workers.dev`）
> 向量库：Qdrant Cloud（AWS us-west-1，collection `hdcx`）
> 模型：Cloudflare Workers AI——向量 `@cf/baai/bge-m3`（1024 维），重排 `@cf/baai/bge-reranker-base`
> 前端：`/search` 页「AI 搜索」模式（`src/components/Search/`）

| 分类 | 范围 | 规模 |
|---|---|---|
| 课程法本 | `books/b1~b4` | 40 篇 / 696 块 |
| 慧灯之光 | `refs/hdzg/01~12` | 137 篇 / 2,561 块（其中 625 块与课程法本重复，见 §5.4） |
| 课程视频 | `static/docs/srts/b1~b4`（四册视频字幕） | 76 个视频（约 119 小时）/ 3,267 块 |
| 合计 | | 6,524 个向量 |

---

## 0. 日常维护（必读）

**为什么要更新索引**：

- 法本的搜索结果按段落号（`#pN`）跳转原文。段落号是构建时按文章内段落顺序编的，**增删、合并、拆分段落都会让后面的段落号整体变化**。
- 视频结果按字幕行的时间跳转，字幕改动后时间与文字也要同步。
- 改了已入库的内容（以 `rag/categories.json` 为准：`books/b1~b4`、`refs/hdzg/01~12`、`static/docs/srts/b1~b4`）却不更新索引，搜索结果会跳错位置，新内容也搜不到。

### 修改内容后（维护者执行）

```bash
pnpm build        # 必须先构建：法本索引读取的是 build/ 下的 HTML（只改字幕可省略）
pnpm rag:update   # 只重建有变化的文章 / 视频 → 递增缓存版本 → 部署接口
```

然后提交 `rag/manifest.json` 和 `workers/rag-api/wrangler.toml` 的改动（脚本自动修改的），照常部署站点。

- 没有改动时 `rag:update` 会提示「需更新 0 篇」，不消耗额度。
- 忘了 `pnpm build` 时脚本会报「源文件比构建产物新」并退出，不会写入错误数据。
- 只改了错别字也建议执行：搜索结果里显示的文字来自索引。

### 没有维护权限的协作者

正常修改、提交内容即可，在提交说明或群里告知维护者「改了哪几篇 / 哪几个字幕」，由维护者执行上面的命令。

### 首次在新电脑上执行（维护者）

1. `pnpm install`
2. 项目根目录创建 `.env.local`（已被 git 忽略，**不要提交、不要发到聊天里**）：
   ```
   CLOUDFLARE_ACCOUNT_ID=…
   CLOUDFLARE_API_TOKEN=…   # 权限：Account → Workers AI → Read + Edit（生成向量用）
   QDRANT_URL=https://…      # Qdrant 集群地址（443 端口，Worker 不能访问 6333）
   QDRANT_API_KEY=…
   ```
3. 安装接口依赖并登录 Cloudflare（部署接口用，账号为 huidengvan@gmail.com）：
   ```bash
   pnpm --dir workers/rag-api install --ignore-workspace
   pnpm --dir workers/rag-api exec wrangler login
   ```
4. Worker 的 Qdrant 地址与 Key 是加密变量（secret），已配置；更换 Key 时执行（按提示粘贴，不要写进文件）：
   ```bash
   pnpm --dir workers/rag-api exec wrangler secret put QDRANT_API_KEY
   ```

### 其他常用操作

| 场景 | 操作 |
|---|---|
| 新增一册法本 / 一个分类 | 在 `rag/categories.json` 添加（见 §5.1），然后 `pnpm build` → `pnpm rag:update` |
| 新增视频字幕 | 放入 `static/docs/srts/bN/`，文件名须与线上视频同名（`.srt` ↔ `.mp4`），然后 `pnpm rag:update` |
| 删除文章 / 字幕 | 删除后 `pnpm build` → `pnpm rag:update`，脚本自动删除对应向量 |
| 只看会改什么，不写入 | `pnpm rag:index --dry-run` |
| 只处理某一部分 | `pnpm rag:index --only books/b2`（或 `refs/hdzg/03`、`video/b1`），再 `pnpm rag:deploy` |
| 调整相关度阈值等参数 | 改 `workers/rag-api/wrangler.toml` 的 `[vars]` → `pnpm rag:deploy`，无需重建索引 |
| 修改接口代码 | 改 `workers/rag-api/src/` → `pnpm rag:deploy` |
| 查看接口实时日志 | `pnpm --dir workers/rag-api exec wrangler tail` |
| 检查 Qdrant collection | `pnpm rag:setup`（不存在则创建，并显示点数） |

---

## 1. 功能

1. `/search` 页可在「字幕搜索」（关键词匹配，`fayuapi.hdcxb.net`）与「AI 搜索」之间切换，关键词保留。
2. AI 搜索按**语义**检索课程法本、慧灯之光与课程视频字幕，可直接提问；按分类 / 册筛选，每个分类一行。
3. **文章结果**：按文章分组，一篇内多处命中按相关度降序；显示以关键句为中心的摘要，可展开全文、复制引用、跳转原文（定位并高亮对应段落）。与课程法本重复的慧灯之光内容只显示一条，注明「亦见于」。
4. **视频结果**：复用「字幕搜索」的卡片，每处命中显示关键行及前后各 2 行字幕，点任一行跳到视频对应时间播放。
5. 相关度低于阈值的内容不显示；无关问题返回空。

---

## 2. 资源与额度

| 资源 | 用量 | 说明 |
|---|---|---|
| Qdrant（免费集群：1 GiB 内存 / 4 GiB 磁盘 / 0.5 vCPU，与另一项目共用） | 6,524 × 1024 维：原始向量约 25.5 MiB，int8 量化副本常驻内存，正文 payload 存磁盘 | 不按存储、查询次数计量；集群闲置会被暂停，但该集群另一项目每天都有访问，本项目上线后也有大量搜索，无需额外保活 |
| Workers AI（免费 1 万 Neurons/天，北京时间 8 点重置） | 每次未命中缓存的搜索：查询向量约 0.02 + 重排 50 段约 4.9 | **约 2,000 次/天**，是主要瓶颈 |
| Workers 请求（免费 10 万次/天） | 每次搜索 1 次 | 充足 |
| 建索引 | 只在内容变化时消耗；正文未变、仅「亦见于」标注变化时复用已有向量 | 全量重建约 3,000 Neurons |

**上线后（每天数千人使用）的应对**：

1. 结果缓存（TTL 1 天）吸收热门、重复的问题。
2. 若 Neurons 不够：先把重排候选从 50 段降到 30 段（约 2.9 Neurons/次），用问题集确认效果不降；
3. 仍不够则升级 Workers Paid（$5/月），超出 1 万 Neurons 后按 $0.011 / 千 Neurons 计费（每多 2,000 次搜索约 $0.1/天）。
4. 注意：额度耗尽时生成查询向量也会失败，接口返回 503，前端提示可改用「字幕搜索」。

---

## 3. 架构

```
离线（内容变化时，pnpm rag:update）
  books/*.md、refs/hdzg/*.md ─ pnpm build ─▶ build/**/index.html ─┐
  static/docs/srts/**/*.srt ──────────────────────────────────────┤
                                                                   ▼
            rag/scripts/build-chunks.mjs（正文切块）+ srt-chunks.mjs（字幕切块）
                                                                   ▼
            rag/scripts/dedupe.mjs（慧灯之光 ↔ 课程法本重复标注）
                                                                   ▼
            rag/scripts/index.mjs：Workers AI（bge-m3）→ Qdrant upsert / delete
                                   rag/manifest.json（每篇 hash + 块 id，增量依据）

在线
  /search（AI 模式）── GET /search?q=…&g=… ──▶ Worker hdcx-rag-api
      ├─ Workers AI：问题 → 向量
      ├─ Qdrant：向量检索 Top 50（按 group / cat 过滤）
      ├─ 去重：慧灯之光重复块换成课程法本对应块
      ├─ Workers AI：bge-reranker-base 重排，保留 ≥ RERANK_MIN
      ├─ 分组：文章（命中段落 + 跳转链接）/ 视频（关键行 + 前后字幕）
      └─ Cache API（自定义域名下生效，键含 INDEX_VERSION）
  ◀── JSON
  文章：/books/b1/1-01?hl=12-14#p12 → DocRoot 定位并高亮 p12~p14
  视频：/video#慧灯禅修课第一册/01 三个差别(2014).mp4#t=00:12:05 → 从该时间播放
```

---

## 4. 跳转定位

### 4.1 法本段落

- `src/plugins/para-anchor.js`（rehype 插件）构建时给每个 `<p>` 按文档顺序编号 `<p id="pN">`；`src/theme/DocRoot/index.js` 监听 `#pN` 调用 `locateParagraph`（滚动、高亮，处理折叠与密法确认）。
- 索引**读取 `build/` 下的 HTML** 而不是 Markdown：`pN` 编号发生在 MDX → HAST 之后（admonition、引用、列表里的 `<p>` 都计数），读 HTML 才能与线上锚点零偏差。前提是索引基于与线上同一份源文件的构建结果。
- 结果链接 `…?hl=起-止#p起`：`#p起` 走原有定位；`hl` 由 `highlightParagraphRange`（`src/utils/index.js`）把其余段落一并高亮。

### 4.2 视频时间

- 视频页 `/video#<系列>/<文件名>.mp4#t=HH:MM:SS`：播放页把 `#t=` 交给 `<video>` 从该时间起播，字幕列表自动定位当前行。链接由 `src/components/Search/api.js` 的 `buildVideoUrl(series, title, startTime)` 生成，与「字幕搜索」一致。
- 字幕文件名须与线上视频同名；索引时已逐一核对 76 个视频均存在。

---

## 5. 索引

### 5.1 分类配置 `rag/categories.json`

索引脚本、接口、前端共用。分类在文件中的顺序即去重时的优先级。

```json
{ "id": "books", "label": "课程法本",
  "groups": [{ "id": "books/b1", "label": "第一册" }, …] }

{ "id": "hdzg", "label": "慧灯之光", "articleHeading": 2,
  "groups": [{ "id": "refs/hdzg/01", "label": "慧灯之光一", "short": "一" }, …] }

{ "id": "video", "label": "课程视频", "type": "srt",
  "groups": [{ "id": "video/b1", "label": "第一册", "dir": "static/docs/srts/b1", "series": "慧灯禅修课第一册" }, …] }
```

- 正文类 `group.id` 为路由路径，即 `build/` 下的目录。
- `articleHeading`：整册为单个文件、文章是某级标题的书（慧灯之光为 2）。
- `short`：筛选按钮上的短名。
- `type: "srt"`：视频字幕，`dir` 为字幕目录，`series` 为视频所在的系列目录。

### 5.2 正文切块（`rag/scripts/build-chunks.mjs`）

1. 解析 `article .theme-doc-markdown`；跳过目录用的 `<details>` 与前有密法 / 灌顶警告的 `<details>`（与 `getSecretDharmaWarning` 同规则，慧灯之光中 1,687 段密法内容已核对无一入库）。
2. 以 `<p id="pN">` 为单元（去掉插件注入的 `[pN]`），其后的无锚点文本（列表、表格）并入前一单元；`h2~h6` 维护章节路径。
3. **600~800 字弹性合并**，不在段落中间切：已达 600 字或再加一段超过 800 字时断块；`h2/h3` 强制断块；过短（不足 150 字）的块并入相邻块。
4. 单段超过 800 字时按句末标点拆成约 700 字的子块，沿用同一 `pN`；无标点的长句硬切。
5. `articleHeading` 级标题处无条件断块，文章名记为 `article`，其下标题为章节；文章末尾过短的块并入同文章前一块。
6. 向量输入加上下文前缀：`第一册《01三个差别》第一、外道和佛教的差别\n正文`；生成向量时去掉藏文字符（藏文偈颂段会以中等分数混入无关结果），显示文字保留。

### 5.3 字幕切块（`rag/scripts/srt-chunks.mjs`）

1. 解析 srt；去掉片尾信息（最后 200 条中第一个网站 / 微博 / 公众号 / 网址 / 著作书单 / 出版社标记之后的全部字幕）。
2. 连续字幕累加到 **300~450 字**（约 2 分钟）断块，达到 300 字后优先在 ≥ 3 秒的停顿处断开；相邻块重叠 4 行，避免一句话被切开。
3. 块内保留每行开始时间（`starts`）与 srt 序号（`lineStart`/`lineEnd`），文字按行存（`text`，以换行分隔）。
4. 向量输入：`第一册视频《01 三个差别(2014)》\n各行字幕`。
5. 文档 id 为 `video/b1/<文件名 SHA-1 前 8 位>`（中文文件名过长）。

### 5.4 慧灯之光与课程法本去重（`rag/scripts/dedupe.mjs`）

课程法本多选自慧灯之光（抽样 93% 的句子原文相同），两边切块边界不同，因此在**建索引时离线标注**：

- 只取汉字做 8 字片段指纹；慧灯之光的块若 ≥ 60% 的片段见于课程法本，记 `dupOf`（对应课程法本块 id）与 `dupGroup`；被重复的课程法本块记 `alsoIn`（JSON 字符串，最多 3 条）。当前 625 块标为重复、590 块带「亦见于」。
- 查询时若课程法本在搜索范围内，慧灯之光的重复块换成对应的课程法本块（不在候选中则按 id 取回）；只搜慧灯之光时不替换。
- 字幕不参与去重（语音转写与书面文字几乎不重合：法本 696 块中仅 5 块与字幕重合 ≥ 30%）。

### 5.5 写入 Qdrant（`rag/scripts/index.mjs`、`qdrant.mjs`）

- collection `hdcx`：1024 维、余弦距离、int8 标量量化（常驻内存）、payload 存磁盘；`cat`、`group`、`doc` 建 keyword 索引用于过滤。
- 点 id 须为整数或 UUID：由块 id（如 `books/b1/1-01#003`）的 SHA-1 派生 UUID，原 id 存 `payload.cid`；接口用同样规则计算（`workers/rag-api/src/qdrant.js`）。
- payload 为块的全部字段（除只用于生成向量的 `embedText`）。
- **增量**：`rag/manifest.json` 记录每篇的 `hash`（正文切块结果）、`metaHash`（重复标注）与块 id。
  - 正文变化 → 重新生成向量，整篇替换（先删多余旧块再写入，段落号可能整体位移）；
  - 仅标注变化 → 从 Qdrant 取回已有向量重新写入，不消耗 Workers AI；
  - 源已不存在 → 删除。
- 有写入或删除时自动把 `wrangler.toml` 的 `INDEX_VERSION` 加 1，部署后接口缓存失效。
- 请求遇到网络错误、429、5xx 自动退避重试；中断后重跑会从未完成的文章继续。

---

## 6. 接口（`workers/rag-api/`）

### 6.1 请求

`GET /search?q=问题&g=books/b1,video/b3&c=hdzg`

- `g`：按册筛选（优先）；`c`：按分类筛选；都不传搜索全部。`q` 最长 100 字。
- `GET /meta`：返回分类配置。

### 6.2 处理流程（`src/index.js`）

1. 校验参数（册、分类须在配置白名单内），查缓存。
2. bge-m3 生成问题向量 → Qdrant 检索 Top `TOP_K`（50），按 `group` / `cat` 过滤。
3. 去重（§5.4）。
4. **重排**：bge-reranker-base 逐段打分（0~1）。模型单段上限 512 token，长块以与问题字面重合最多的句子（字幕为行）为中心截取 `RERANK_CHARS`（380）字（`src/focus.js`）；保留 `≥ RERANK_MIN`（0.6）。重排失败时回退为向量相似度 + 关键词加分。
5. **分组**（最多 `MAX_DOCS` 10 组，每组最多 `MAX_HITS_PER_DOC` 5 处，按最高分排序）：
   - 文章：按「文档 + 文章名」分组，每处命中带 `href`、`section`、`text`、`alsoIn`；
   - 视频：按视频分组，每处命中找出与问题字面重合最多的一行（无重合取中间行），取前后各 `CONTEXT_LINES`（2）行；同一视频中窗口重叠的命中只保留分数高的。
6. 写缓存（TTL `CACHE_TTL` 1 天，键含 `INDEX_VERSION`），返回。

### 6.3 返回

```json
{ "q": "人身难得", "tookMs": 775, "ranker": "rerank", "results": [
  { "doc": "books/b1/1-01|01三个差别", "url": "/books/b1/1-01", "title": "01三个差别", "group": "books/b1",
    "groupLabel": "第一册", "score": 0.99,
    "hits": [{ "pStart": 8, "pEnd": 12, "section": "…", "score": 0.99, "text": "…",
               "href": "/books/b1/1-01?hl=8-12#p8",
               "alsoIn": [{ "label": "慧灯之光一《三个差别》", "href": "/refs/hdzg/01?hl=7-13#p7" }] }] },
  { "type": "video", "doc": "video/b3/…", "series": "慧灯禅修课第三册", "title": "02-4 慧灯禅修课5 人身难得4",
    "groupLabel": "第三册", "score": 0.99, "count": 5,
    "hits": [{ "score": 0.99, "lines": [
      { "lineId": 1500, "startTime": "01:39:52.000", "text": "…", "ctx": true },
      { "lineId": 1502, "startTime": "01:39:56.160", "text": "我们说人身难得 怎么难得呢", "hit": true }, … ] }] }
] }
```

视频结果的 `series` / `title` / 字幕行与「字幕搜索」接口字段一致。

### 6.4 配置

| 位置 | 项 |
|---|---|
| `wrangler.toml` `[vars]` | `QDRANT_COLLECTION`、`ALLOWED_ORIGINS`、`ALLOW_DEV_ORIGINS`（允许 localhost / 局域网）、`TOP_K`、`RERANK_MIN`、`RERANK_CHARS`、`MIN_SCORE` / `REL_GAP` / `KEYWORD_BONUS`（重排失败时的回退阈值）、`MAX_HITS_PER_DOC`、`MAX_DOCS`、`CONTEXT_LINES`、`CACHE_TTL`、`INDEX_VERSION` |
| Worker secret | `QDRANT_URL`、`QDRANT_API_KEY` |
| 绑定 | `AI`（Workers AI） |
| 路由 | 自定义域名 `ragapi.hdcxb.net` |

---

## 7. 前端（`src/components/Search/`）

| 文件 | 作用 |
|---|---|
| `index.jsx` | 「字幕搜索 / AI 搜索」切换，URL 同步 `?mode=ai&q=…&g=…`；AI 模式的提示文字与「可以这样问」示例问句 |
| `SearchBar.jsx` | 搜索框；提示文字、示例标签及其标题可由调用方传入 |
| `AiFilter.jsx` | 每个分类一行（「全部」在第一行行首），分类按钮一键全选该分类 |
| `AiResultList.jsx` | 结果列表：文章卡片（序号、册 / 篇名、相关度、关键句摘要、展开 / 复制引用 / 跳转原文、亦见于）；视频交给 `SearchCard` |
| `SearchCard.jsx` | 「字幕搜索」的视频卡片，AI 搜索复用：可选序号、计数文案；字幕行支持 `hit`（关键行底色）、`ctx`（上下文淡色）、`gap`（命中之间分隔） |
| `ragApi.js` | 请求接口；关键词片段提取、句子拆分、摘要窗口、相关度分级 |
| `ai.module.css` | AI 模式样式（卡片通用样式复用 `search.module.css`） |

- 复制引用格式：`正文\n——第一册《01皈依》二、皈依的含义（第 13～16 段）\nhttps://huidengchanxiu.net/books/b4/4-01#p13`。
- 示例问句均已实测能命中对应文章：出离心和世间善法有什么区别 / 如何把病苦转为道用 / 放生怎样才算大乘法 / 皈依的目的是什么。

---

## 8. 相关度校准记录

- bge-m3 余弦相似度：相关 0.55~0.75、无关 0.35~0.50，区分度不足（「什么是出离心」中定义出离心的段落仅 0.509；「二谛」会把《09四谛》排在《10二谛》前）。
- 启用重排后：无关问题多在 0.2 以下（「股票投资技巧」偶有 0.52 的误报），相关段落 0.62~0.99，故 `RERANK_MIN = 0.6`。
- 重排输入：全文（被截在 512 token）7.2 Neurons/次；以关键句为中心截取 380 字 4.9 Neurons/次且排序更好；460 字无改善。
- 复测（四类内容入库后）：「二谛」《10二谛》视频与法本居前；「人身难得」定位到「我们说人身难得 怎么难得呢」；「如何做红烧肉」「股票投资技巧」无结果。
- 调参只改 `wrangler.toml` 的 `[vars]` 并部署，无需重建索引。

---

## 9. 数据预处理记录

- **字幕片尾清理**：10 个视频字幕末尾的网站、堪布微博 / 博客、公众号、「堪布著作」书单、出版社、ISBN 等共 517 条已删除；逐个核对保留的最后一条均为「今天就讲到这里」「回向」「谢谢大家」等结束语。切块脚本也会自动跳过此类片尾。
- **繁转简**：`b1/08 佛教的定义` 整份繁体（3,957 字）、`b2/05-1 素食的意义01`（9 字）用 OpenCC 全量转换；另 6 个文件只替换零星繁体字（築、唸、會、決、袞、辦）。未全量转换其余文件：OpenCC 会把正当的「执著」改为「执着」、「抬」改为「擡」、藏文音译中的「錒」改为「锕」。
- **重复字幕**：`b2/03-2 佛法融入生活：如何面对痛苦.srt` 与 `…痛苦2.srt` 内容完全相同，删除前者（线上视频为后者的名字）。
- `static/docs/srts` 只作为 AI 搜索的数据源；视频播放页加载 wasabi 上与视频同名的 srt，「字幕搜索」使用 `fayuapi` 自己的数据，二者不受上述处理影响。
- 仓库中字幕为 LF 换行，本地工作区可能是 CRLF；脚本写回统一用 LF，避免整份文件出现在 diff 中。

---

## 10. 目录与命令

```
rag/
  README.md                 本文档
  categories.json           分类配置（索引脚本、接口、前端共用）
  manifest.json             已索引文章 / 视频的 hash 与块 id（rag:index 自动维护，需提交）
  scripts/
    lib.mjs                 公共配置、Workers AI REST 调用
    qdrant.mjs              Qdrant 操作（collection、upsert、delete、取回向量、点 id 规则）
    setup-index.mjs         初始化 / 检查 collection
    build-chunks.mjs        正文切块（build HTML）；字幕分类转交 srt-chunks.mjs
    srt-chunks.mjs          字幕解析、片尾清理、切块
    dedupe.mjs              慧灯之光 ↔ 课程法本重复标注
    index.mjs               增量向量化、写入 / 删除、更新 manifest 与 INDEX_VERSION
  out/                      生成物（已 .gitignore）
workers/rag-api/
  wrangler.toml             绑定、自定义域名、参数
  src/index.js              /search、/meta
  src/qdrant.js             Qdrant 检索
  src/focus.js              重排输入的关键句截取
```

| 脚本 | 作用 |
|---|---|
| `pnpm rag:update` | **日常用这个**：`rag:index` + `rag:deploy` |
| `pnpm rag:index` | 增量向量化并写入 Qdrant；参数 `--only`、`--dry-run`、`--full`、`--force` |
| `pnpm rag:deploy` | 部署接口 |
| `pnpm rag:chunks` | 只切块并打印统计，不调用任何服务 |
| `pnpm rag:setup` | 初始化 / 检查 Qdrant collection |

---

## 11. 后续可选

- **关键词混合检索**：Qdrant 支持稀疏向量 / BM25，可与语义检索融合，对短词和字幕中的识别错字更友好。
- **生成回答**：基于命中段落调用大模型生成带出处的回答（Workers AI 免费额度对大模型较紧，需单独评估）。
- **清理旧索引**：早期使用的 Cloudflare Vectorize 索引 `hdcx-rag` 已不再使用，确认稳定后可在控制台删除。
