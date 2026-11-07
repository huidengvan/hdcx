-- 关键词搜索（D1 数据库 fayu）：课程视频字幕 + 课程法本 + refs 下的文章
-- 每个视频 / 每篇文章一行元数据（docs）；字幕条或段落按顺序打包成块，每块原文与规范化文本各不超过约 90KB（D1 单条 SQL 100KB）
-- 同一块拆成两张表：block_norms 存规范化文本（去空白标点、繁转简，规则见 src/normalize.js），block_texts 存原文，都只按主键取当前页要显示的块
-- 排名时全表扫描的是 doc_norms：每篇文档一行，由 block_norms 在库内拼接而成，行数约为块数的三分之一
-- 行数受 D1 免费额度约束：每天读 500 万行、写 10 万行，因此不能一段一行
-- 规范化规则或 t2s.js 改动后须重新导入

CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY,          -- 全量导入时按分类、目录顺序编号；增量导入沿用原编号，新文档排在最后
    cat TEXT NOT NULL,               -- 分类：video 课程视频 / books 课程法本 / hdzg 慧灯之光 / misc 其他参考 / refs 参考资料
    grp TEXT NOT NULL,               -- 分组：视频为 b1~b4，文章为所在目录，如 books/b1、refs/qxgs、refs/hdzg/01
    grp_label TEXT NOT NULL,         -- 分组名：第一册、前行广释、慧灯之光一……
    title TEXT NOT NULL,             -- 视频文件名 / 文章名（慧灯之光为册内的二级标题）
    series TEXT,                     -- 视频：播放器目录，路径 /video#{series}/{title}.mp4
    url TEXT,                        -- 文章：页面路径，段落锚点为 #p{段落号}
    units INTEGER NOT NULL           -- 字幕条数 / 段落数
);

-- 排名用：未命中 rank_cache 时全表扫描。各块以换行相隔，与逐块查找结果相同（短语不跨块）
-- 单行上限 2MB，超出的文档拆成多份（part），排名时按 doc_id 汇总
CREATE TABLE IF NOT EXISTS doc_norms (
    doc_id INTEGER NOT NULL REFERENCES docs (id),
    part INTEGER NOT NULL,
    cat TEXT NOT NULL,               -- 同 docs.cat，统计各分类命中数时免去联表
    norm TEXT NOT NULL,
    PRIMARY KEY (doc_id, part)
);

-- 定位命中用：只按主键读取当前页文档的块
CREATE TABLE IF NOT EXISTS block_norms (
    doc_id INTEGER NOT NULL REFERENCES docs (id),
    seq INTEGER NOT NULL,            -- 块序号
    cat TEXT NOT NULL,               -- 同 docs.cat；当前 Worker 不再读取，保留是为了导入后、部署前旧版 Worker 仍可用
    norm TEXT NOT NULL,              -- 各条规范化文本直接拼接（文章段落之间加换行，短语不跨段匹配）
    norm_lens TEXT NOT NULL,         -- 各条在 norm 中的长度（UTF-16 单元），逗号分隔
    PRIMARY KEY (doc_id, seq)
);

-- 展示用：与 block_norms 一一对应，只按主键读取
CREATE TABLE IF NOT EXISTS block_texts (
    doc_id INTEGER NOT NULL REFERENCES docs (id),
    seq INTEGER NOT NULL,
    first_unit INTEGER NOT NULL,     -- 块内第一条在文档中的序号（从 0 起）
    marks TEXT NOT NULL,             -- 视频：各条开始时间（毫秒）；文章：各段段落号；逗号分隔
    texts TEXT NOT NULL,             -- 各条原文，换行分隔（文章段落内的换行替换为空格）
    PRIMARY KEY (doc_id, seq)
);

-- 排名结果缓存，各节点共享：key 为 数据版本:关键词，value 为 [[id, cat, 出现次数], ...]（已排序）
-- Worker 写入时只保留最新的 RANK_CACHE_ROWS 行，每次导入清空
CREATE TABLE IF NOT EXISTS rank_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- version：数据内容哈希，Worker 据此让结果缓存失效；updated_at：导入时间
CREATE TABLE IF NOT EXISTS meta (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
