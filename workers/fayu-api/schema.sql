-- 法语字幕搜索（D1 数据库 fayu）
-- 每个视频一行元数据；字幕按连续若干条打包成块（cue_blocks，每块约 40KB，受 D1 单条 SQL 100KB 的限制）
-- 块内存有规范化文本 norm（去空白标点、繁转简，规则见 src/normalize.js），检索时 SQL 先用 instr 筛出含关键词的块，
-- 每次搜索只读约 300 行（逐行存储 + LIKE 全表扫描要读 11 万多行）
-- 规范化规则或 t2s.js 改动后须重新导入

CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY,          -- 按册、文件名排序的序号（每次导入重新编号）
    book TEXT NOT NULL,              -- 册：b1 ~ b4（srt 目录名）
    series TEXT NOT NULL,            -- 视频目录，播放器路径 /video#{series}/{title}.mp4
    title TEXT NOT NULL,             -- 视频文件名（不含扩展名）
    cues INTEGER NOT NULL,           -- 字幕条数
    duration INTEGER NOT NULL,       -- 时长（秒，取最后一条字幕的结束时间）
    UNIQUE (series, title)
);

CREATE TABLE IF NOT EXISTS cue_blocks (
    video_id INTEGER NOT NULL REFERENCES videos (id),
    seq INTEGER NOT NULL,            -- 块序号
    first_cue INTEGER NOT NULL,      -- 块内第一条字幕在视频中的序号（从 0 起）
    starts TEXT NOT NULL,            -- 各条字幕开始时间（毫秒），逗号分隔
    texts TEXT NOT NULL,             -- 各条字幕文本，换行分隔
    norm TEXT NOT NULL,              -- 各条规范化文本直接拼接，供 instr 检索
    norm_lens TEXT NOT NULL,         -- 各条规范化文本长度（UTF-16 单元），逗号分隔，用于把命中位置换算回字幕条
    PRIMARY KEY (video_id, seq)
);

-- version：数据内容哈希，Worker 据此刷新内存缓存与结果缓存；updated_at：导入时间
CREATE TABLE IF NOT EXISTS meta (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
