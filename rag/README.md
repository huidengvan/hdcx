# AI 语义搜索（RAG 检索）设计文档

> 状态：第一～四册已入库（40 篇 / 696 块，约占存储额度 14.3%，2026-11-01）；API：`https://ragapi.hdcxb.net`（备用 `https://hdcx-rag-api.huidengvan.workers.dev`）  
> 范围：第一期覆盖 `/books/b1` ~ `/books/b4`（分类「课程法本」），后续可按分类追加其他书。  
> 技术栈：Cloudflare Workers AI（`@cf/baai/bge-m3`，1024 维）+ Vectorize + Worker API；前端集成到现有 `/search` 页。

---

## 1. 目标

1. `/search` 页可在「字幕搜索」（现有，调用 `fayuapi.hdcxb.net`）与「AI 搜索」之间切换。
2. AI 搜索按**语义**检索法本正文，支持按分类 / 册筛选；分类可配置，后续新增书只改配置 + 重跑索引。
3. 结果按**文章分组**：一篇文章内多处命中时按相关度降序排列；相关度低于阈值的段落不显示，整篇都不达标的文章不出现。
4. 点击任一命中，跳转到原文对应**段落**（`#pN` 锚点），并高亮该命中覆盖的段落范围。
5. 全部运行在 Cloudflare 免费额度内。

非目标（第一期不做）：大模型生成回答（RAG 的 "G"）。见 §9 后续扩展。

---

## 2. 规模与免费额度（实测）

从 `build/books/b1~b4/**/index.html` 抽取正文统计（`<p id="pN">` 段落）：

| 项 | 数值 |
|---|---|
| 文章 | 40 篇 |
| 带锚点段落 | 4,248 段（最长 610 字；`scripts/split_long_para.js` 不用于 `/books`、`/refs/hdzg`，段落保持原样） |
| 正文字数 | 约 40.1 万（含标题、列表约 42.8 万） |
| 按 600~800 字弹性切块 | 不考虑标题断块约 625 块（中位 647 字）；按标题断块后预计 **700~800 块** |

> 注：早先用 `wc -m` 估算的 124 万「字符」实际是 UTF-8 字节数（中文 3 字节/字），以本表为准。

额度占用（保守按 850 向量 × 1024 维估算）：

| 免费额度 | 用量 | 占比 |
|---|---|---|
| Vectorize 存储 5M 维 | 850 × 1024 ≈ 0.87M | **约 17%** |
| Vectorize 查询 30M 维/月 | 公式 `(查询次数 + 存量向量数) × 维度` → 存量固定占 0.87M | 剩余可支撑 **约 2.8 万次查询/月（≈ 930 次/天）** |
| Workers AI 10,000 Neurons/天 | 全量建索引约 40 万 token ≈ 500 Neurons；单次查询 ≈ 0.02 Neurons | 可忽略 |
| Workers 请求 100,000 次/天 | 每次搜索 1 次请求 | 可忽略 |

瓶颈是 Vectorize 查询维度，通过 §6.4 的结果缓存进一步降低。

---

## 3. 总体架构

```
           ┌──────────── 离线（发布时手动执行）────────────┐
 books/*.md │ pnpm build → build/books/**/index.html         │
            │      │                                         │
            │      ▼ rag/scripts/build-chunks.mjs            │
            │  rag/out/chunks.jsonl（段落锚点 + 文本）        │
            │      │                                         │
            │      ▼ rag/scripts/index.mjs                    │
            │  Workers AI REST (bge-m3) → 向量                │
            │  Vectorize REST upsert / delete_by_ids          │
            │  rag/manifest.json（每篇文章 hash + 向量 id）   │
            └────────────────────────────────────────────────┘

           ┌──────────── 在线 ──────────────────────────────┐
 /search    │  AI 模式  ──GET /search───▶  Worker rag-api      │
 (Docusaurus)│                             ├─ env.AI.run(bge-m3)│
            │                             ├─ env.VECTORIZE.query│
            │                             ├─ 阈值过滤 + 按文章分组│
            │  ◀── JSON 结果（文章 → 命中段落）─┘  + Cache API    │
            │                                                   │
            │  点击命中 → /books/b1/1-01?hl=12-14#p12            │
            │  DocRoot：locateParagraph('p12') + 高亮 p12~p14    │
            └───────────────────────────────────────────────────┘
```

---

## 4. 关键设计：如何精确跳回原文

### 4.1 现有锚点机制（直接复用）

- `src/plugins/para-anchor.js`（rehype 插件）在构建时给**每个 `<p>`** 按文档顺序编号：`<p id="pN">`，`books` 插件已启用。
- `src/theme/DocRoot/index.js` 监听 `location.hash`，调用 `src/utils/index.js` 的 `locateParagraph('pN')`：滚动、高亮，并处理 `<details>` 折叠与密法警告确认。

所以 RAG 只需要知道每个文本块对应的 `pStart ~ pEnd`，结果链接直接用 `#p{pStart}`。

### 4.2 为什么从构建产物（HTML）而不是 Markdown 切块

`pN` 的编号发生在 MDX → HAST 之后：admonition、blockquote、松散列表、MDX 组件里的 `<p>` 都会被计数。如果自己解析 Markdown 复刻编号，容易和线上错位。**以 `build/` 下的 HTML 为唯一真相**，读到的 `id="pN"` 就是线上锚点，零漂移。

前提：索引必须基于与线上**同一份源文件**的构建结果（发布流程见 §7）。

### 4.3 范围高亮（新增，小改动）

一个块通常包含 2~3 段。链接形如：

```
/books/b1/1-01?hl=12-14#p12
```

- `#p12`：沿用现有逻辑滚动并高亮首段（含密法确认流程）。
- `?hl=12-14`：DocRoot 新增一个 effect，`locateParagraph` 完成后，对 `p12..p14` 逐个调用 `highlightParagraph`（需把当前的“单节点高亮”扩展为支持多节点，或新增 `highlightParagraphRange(start, end)`）。
- 查询参数对 Docusaurus 静态路由无副作用；不带 `hl` 时行为与现在完全一致。

---

## 5. 索引管线

### 5.1 分类配置（前端 / 索引脚本 / Worker 共用）

`rag/categories.json`：

```json
{
  "categories": [
    {
      "id": "books",
      "label": "课程法本",
      "groups": [
        { "id": "books/b1", "label": "第一册" },
        { "id": "books/b2", "label": "第二册" },
        { "id": "books/b3", "label": "第三册" },
        { "id": "books/b4", "label": "第四册" }
      ]
    }
  ]
}
```

- `group.id` 直接取路由路径（去掉开头 `/`），天然全局唯一，也是 `build/` 下的目录。
- 以后加书：追加一个 category（如 `4jx`）或在现有 category 里加 group，重跑索引即可，前端筛选自动出现。

### 5.2 切块规则（`rag/scripts/build-chunks.mjs`）

输入：每个 group 目录下的 `build/<group>/*/index.html`。解析 `article .theme-doc-markdown`（用 `node-html-parser`，作为 devDependency）。

1. **跳过**：目录用的 `<details>`（summary 为「目录」）；前面紧邻密法 / 灌顶 / 警告类 admonition 的 `<details>`（与 `getSecretDharmaWarning` 同规则，避免在搜索结果里裸露密法内容）；脚注、导航、按钮等非正文。
2. **标题**：`h1` 作为文章标题；`h2~h4` 维护章节路径（如 `第一、外道和佛教的差别`），作为块的 `section`。
3. **基本单元**：每个 `<p id="pN">` 为一个单元，去掉开头插件注入的 `[pN] ` 链接文本。紧随其后的无锚点文本（`li`、`td` 等）并入前一个单元（锚点沿用前一段）。
4. **合并（600~800 字弹性窗口，不在段落中间切）**：同一章节内按顺序累加整段；当前块已达 600 字，或加入下一段会超过 800 字时断块；遇到 `h2/h3` 强制断块；断出的块不足 150 字时并入同章节的下一块（允许略超 800）。
5. **超长单元**（单段 >800 字，当前语料最长 610 字，暂不存在）：按 `。！？` 句末切成 600~800 字的子块，各子块沿用同一 `pN`。
6. **上下文前缀（只用于生成向量，不用于展示）**：
   ```
   第一册《01三个差别》第一、外道和佛教的差别
   <块正文>
   ```
   让「这篇在讲什么」参与语义，显著提升短段落的召回。

输出 `rag/out/chunks.jsonl`（不入库，每行一个块）：

```json
{
  "id": "books/b1/1-01#03",
  "cat": "books",
  "group": "books/b1",
  "doc": "books/b1/1-01",
  "url": "/books/b1/1-01",
  "title": "01三个差别",
  "section": "第一、外道和佛教的差别",
  "pStart": 12,
  "pEnd": 14,
  "text": "……块正文……"
}
```

脚本同时打印统计：块数、平均 / 最大长度、预计存储维度与占免费额度百分比，方便每次加书前预估。

### 5.3 向量化与写入（`rag/scripts/index.mjs`）

- 凭据从 `.env.local` 读取（已在 `.gitignore` 中）：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`VECTORIZE_INDEX=hdcx-rag`。
- 向量化：`POST /accounts/{id}/ai/run/@cf/baai/bge-m3`，`{ "text": [...] }` 每批 50 条。
- 写入：`POST /accounts/{id}/vectorize/v2/indexes/{name}/upsert`（NDJSON），metadata 为上面 JSON 除 `id` 外的字段（`text` 约 2KB，低于 Vectorize 单向量 metadata 10KiB 上限）。
- **增量**：`rag/manifest.json`（入库）记录 `{ doc: { hash, ids: [...] } }`，hash 取该文章的切块结果。
  - hash 不变 → 跳过；
  - hash 变化 → 先 `delete_by_ids` 删掉旧 ids，再 upsert 新块（段落编号可能整体位移，所以按**整篇**替换）；
  - manifest 里有、本次没有的文章 → 删除。
- 参数：`--dry-run`（只切块和统计）、`--only books/b2`、`--full`（忽略 manifest 全量重建）。

### 5.4 Vectorize 索引初始化（一次性，已完成）

```bash
node rag/scripts/setup-index.mjs   # 创建 hdcx-rag（1024 维，cosine）及 cat / group 两个 metadata 索引，可重复执行
```

另：生成向量时会去掉藏文字符（显示文本保留），否则藏文偈颂段会以 ~0.5 的分数混入无关结果。

> ⚠️ metadata 索引必须在**写入向量之前**创建，否则已有向量不会参与过滤。

---

## 6. Worker API（`workers/rag-api/`）

独立目录，自带 `package.json` 和 `wrangler.toml`，不加入根依赖。

### 6.1 绑定与变量

```toml
name = "hdcx-rag-api"
main = "src/index.js"
compatibility_date = "2026-10-01"

[ai]
binding = "AI"

[[vectorize]]
binding = "VECTORIZE"
index_name = "hdcx-rag"

[vars]
ALLOWED_ORIGINS = "https://huidengchanxiu.net,http://localhost:3000"
TOP_K = "50"            # returnMetadata=all 时 Vectorize 上限为 50
MIN_SCORE = "0.52"      # 绝对下限，见 §8
REL_GAP = "0.10"        # 与第 1 名的最大分差
MAX_HITS_PER_DOC = "5"
KEYWORD_BONUS = "0.03"  # 关键词（去疑问词）出现即加分，每多一次 +0.01，最多再 +0.03
```

### 6.2 接口

`GET /search?q=什么是出离心&g=books/b1,books/b3`（GET 便于缓存且无 CORS 预检）

- `g`：按册筛选；为空时看 `c`（分类）；都为空 → 全部

```json
// 响应
{
  "q": "什么是出离心",
  "tookMs": 180,
  "results": [
    {
      "doc": "books/b1/1-01",
      "url": "/books/b1/1-01",
      "title": "01三个差别",
      "group": "books/b1",
      "groupLabel": "第一册",
      "score": 0.71,
      "hits": [
        { "pStart": 31, "pEnd": 33, "section": "第二、世间法和出世间法的差别",
          "score": 0.71, "text": "……", "href": "/books/b1/1-01?hl=31-33#p31" },
        { "pStart": 24, "pEnd": 25, "section": "…", "score": 0.63, "text": "…", "href": "…" }
      ]
    }
  ]
}
```

`GET /meta`：返回 `categories.json`（可选，前端也可直接 import）。

### 6.3 处理流程

1. 校验：`q` 去空白后 1~100 字；`groups` / `cats` 必须在配置白名单内。
2. 查缓存（§6.4），命中直接返回。
3. `env.AI.run('@cf/baai/bge-m3', { text: [q] })` 得到查询向量（bge-m3 查询端无需指令前缀）。
4. `env.VECTORIZE.query(vec, { topK, returnMetadata: 'all', filter })`，filter 用 `{ group: { $in: groups } }` 或 `{ cat: { $in: cats } }`。
   - `returnMetadata: 'all'` 时 topK 上限为 50，取 50 作为候选。
5. **重排**：`env.AI.run('@cf/baai/bge-reranker-base', { query: q, contexts })`，contexts 为「篇名 章节
正文」，逐段输出 0~1 相关度；保留 `score >= RERANK_MIN（0.5）`。
   - 每次约 2.5 万 token ≈ 7 Neurons，免费额度约 1,400 次/天（仍以 Vectorize 每月查询额度为瓶颈）；耗时约 +1s，结果有缓存。
   - 响应带 `ranker` 字段：`rerank` 或 `dense`。
6. **回退（重排调用失败时）**：`score = cosine + 关键词加分`（去掉疑问词后的关键词出现即加 `KEYWORD_BONUS`，每多一次 +0.01，最多再 +0.03），保留 `score >= max(MIN_SCORE, top1 - REL_GAP)`。
7. **按文章分组**：最多 `MAX_DOCS`（10）篇；同一 `doc` 的命中按 score 降序，最多 `MAX_HITS_PER_DOC` 条；**相邻块不合并**（实测合并会产生跨上百段的范围，失去定位精度）。文章按其最高分降序。
8. 写缓存，返回。

### 6.4 缓存与防滥用

- `caches.default`，key = 规范化后的 `q + 排序后的 groups`，TTL 1 天；重建索引后通过在 key 中带 `INDEX_VERSION` 变量失效。
- 可选：Workers Rate Limiting 绑定，每 IP 每分钟 20 次。
- 超额或出错时返回 `503 + { error }`，前端提示「AI 搜索暂不可用，可改用字幕搜索」。

### 6.5 CORS

只允许 `ALLOWED_ORIGINS` 里的来源，处理 `OPTIONS` 预检。本地 `pnpm dev`（`--host 0.0.0.0`）若用局域网 IP 访问，需把对应 origin 加进去。

---

## 7. 前端集成（`src/components/Search/`）

### 7.1 模式切换

- 页头加分段切换：「字幕搜索 | AI 搜索」，同步到 URL：`/search?mode=ai&q=…&g=books/b1,books/b3`。
- 默认仍为字幕搜索，现有逻辑与 URL 参数（`q`、`page`）保持不变。
- 页头标题 / 说明、空状态引导文字随模式切换。
- API 地址与现有 `api.js` 一致，以常量写在 `src/components/Search/ragApi.js`（`RAG_API_URL`）。

### 7.2 新增文件

| 文件 | 作用 |
|---|---|
| `ragApi.js` | `ragSearch(q, groups)`，带 `AbortController`（新搜索取消旧请求） |
| `AiFilter.jsx` | 分类 → 册的多选 chip；选中整个分类等于选中其下全部册；选择记忆在 URL `g` 参数 |
| `AiResultList.jsx` | 结果容器（加载 / 空 / 错误）+ 文章卡片 + 命中段落块 |
| `ai.module.css` | 模式切换、筛选、卡片与命中段落样式 |

筛选配置直接 `import categories from '@site/rag/categories.json'`。

### 7.3 结果卡片

- 头部：序号（01、02…）+ `第一册 / 篇名`（篇名链接到最相关段落）+ 命中数与相关度点（重排分映射为 1~5 级，不显示小数）。
- 命中段落块（默认前 3 条，「查看本篇其余 N 处」）：
  - 章节名（小字）；
  - 折叠时显示以第一个含关键词的句子为中心、约 150 字的摘要，被截断处显示「…」；**展开**后显示完整段落；
  - 含查询关键词（查询中出现在原文的 ≥2 字片段）的整句以米色底标出；
  - 操作：「展开 / 收起」（左）、「复制引用」「跳转原文」（右）。
- 复制引用格式：`正文
——第一册《01皈依》二、皈依的含义（第 13～16 段）
https://huidengchanxiu.net/books/b4/4-01#p13`，复制后 toast 提示。
- 跳转：**同标签页**跳转 `href`（`@docusaurus/Link`），返回时 URL 里的 `q`、`g` 恢复搜索状态；Ctrl/⌘+点击照常新标签页打开。

### 7.4 原文页（`src/theme/DocRoot/index.js`）

- 新增 `hl` 参数处理（§4.3）。
- 现有 `#pN` 定位、密法确认流程不变。

---

## 8. 相关度校准

第四册实测（2026-11-01）：相关问题 top 分 0.62~0.73；短词（「四无量心」）0.52~0.63；无关问题（「如何做红烧肉」「股票投资技巧」）最高 0.42~0.46。据此定 `MIN_SCORE=0.50`、`REL_GAP=0.10`。

四册全部入库后复测：「股票投资技巧」最高 0.5055、「如何做红烧肉」命中《佛法融入生活》饮食段 0.559（语义上确有关联），故 `MIN_SCORE` 提到 0.52；`TOP_K` 提到 50，并把关键词加分改为“去疑问词后的关键词 + 出现次数递增”。

纯向量打分的不足：短问题（如「什么是出离心」）区分度低，《01三个差别》中定义出离心的段落语义分仅 0.509，加分后仍略低于相对阈值；「二谛」把《09四谛》排在《10二谛》之前。

**启用重排后（2026-11-01）**：无关问题最高重排分 0.17（股票）/ 0.07（红烧肉），相关段落 0.8~0.99，阈值定 `RERANK_MIN=0.5`。复测：「二谛」《10二谛》第一；「什么是出离心」召回《01三个差别》；「如何做红烧肉」「股票投资技巧」均无结果。

`MIN_SCORE` / `REL_GAP` 的初始值是经验值（bge-m3 中文：相关段落通常 0.55~0.75，无关 0.35~0.50），需要用真实问题校准：

1. `rag/eval/queries.json`：20~30 条问题，每条标注应命中的文章（最好带大致段号），包括：
   - 概念类（「什么是出离心」）、问题类（「放生怎样才算大乘法」）；
   - 短词（「四谛」「人身难得」）；
   - 应当**无结果**的问题（「如何做红烧肉」）。
2. `rag/scripts/eval.mjs`：逐条调用 Worker（或直连 REST），输出每条的 top 分数分布、期望文章的排名、在当前阈值下的召回 / 误报。
3. 调参直到：期望文章都在结果里，无关问题返回空。阈值改 `wrangler.toml` 的 vars，重新 `wrangler deploy` 即生效，无需重建索引。
4. 若短词或近义问题效果不佳，再启用 §9 的重排。

---

## 9. 后续扩展

- **新增分类**：在 `categories.json` 追加 → `pnpm build` → `pnpm rag:index`。每加 1 万字约多 20 个向量，存储预算充足（§2）。
- **生成回答**：基于命中块调用 LLM 生成带引用（`[第一册·01 ¶31]`）的回答。Workers AI 免费 Neurons 对大模型较紧，需单独评估模型与次数上限。

---

## 10. 目录与命令约定

```
rag/
  README.md                 本文档
  categories.json           分类 / 册配置（三端共用）
  manifest.json             已索引文章 hash 与向量 id（入库）
  eval/queries.json         校准问题集
  scripts/
    build-chunks.mjs        build HTML → out/chunks.jsonl
    index.mjs               向量化 + upsert/delete，更新 manifest
    eval.mjs                阈值校准
  out/                      生成物（加入 .gitignore）
workers/rag-api/
  package.json              wrangler 依赖（独立，不进根 workspace）
  wrangler.toml
  src/index.js
```

根 `package.json` 新增脚本：

```json
"rag:chunks": "node rag/scripts/build-chunks.mjs",
"rag:index":  "node rag/scripts/index.mjs",
"rag:eval":   "node rag/scripts/eval.mjs"
```

**发布流程**（内容有更新时）：

```bash
pnpm build
pnpm rag:index          # 仅处理有变化的文章
```

然后照常部署站点。Worker 代码有改动时，在 `workers/rag-api` 下执行 `npx wrangler deploy`。

---

## 11. 实施阶段

| 阶段 | 内容 | 产出 / 验收 |
|---|---|---|
| P0 准备 | §12 清单 | 账号、Token、域名、问题集就绪 |
| P1 切块 | `categories.json`、`build-chunks.mjs`、`--dry-run` 统计 | 抽查 10 个块的 `pStart` 与线上 `#pN` 一致 |
| P2 索引 | Vectorize 初始化、`index.mjs`、manifest | 控制台可见约 800 个向量；改一篇文章后只重建这一篇 |
| P3 API | Worker `/search`、过滤、分组、缓存、CORS，部署 | curl 返回分组结果；无关问题返回空 |
| P4 前端 | 模式切换、筛选、结果卡片、`hl` 范围高亮 | 点击命中准确跳到并高亮原文段落；移动端可用 |
| P5 校准 | `eval.mjs` 跑问题集，调阈值，视效果启用重排 | 期望文章全部召回、无关问题无结果 |

---

## 12. 需要你准备 / 确认的事项

1. **Cloudflare 账号**：Account ID；确认使用 Workers Free 计划。
2. **API Token**（给本地索引脚本用，写入 `.env.local`，不要发到聊天里）：权限只需两项：*Account → Workers AI → Read + Edit*（可从「Workers AI」模板创建）、*Account → Vectorize → Edit*；Agents Gateway、AI Gateway、AI Search、Auto Rag、Websearch 等其他 AI 类权限都不需要。部署 Worker 可直接 `npx wrangler login`。
3. **API 域名**：沿用 `hdcxb.net`（如 `ragapi.hdcxb.net`，需要该域名托管在 Cloudflare），还是先用 `*.workers.dev`？
4. **站点部署方式**：`huidengchanxiu.net` 当前部署在哪（Cloudflare Pages / GitHub Pages / 其他）？决定 CORS 来源，以及索引是否放进 CI。
5. **校准问题集**：20~30 条典型问题 + 期望出处（文章即可，有段号更好），含 3~5 条应无结果的问题。
6. **命名确认**：分类名「课程法本」、切换按钮文案「字幕搜索 / AI 搜索」是否合适。
