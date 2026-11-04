/**
 * 音频的下载线路。正文里的 src 保持原样，作为兜底线路，播放时按 media → box → 原地址 依次尝试。
 * 存储桶目录与网盘目录一一对应：jmy ↔ 禅修班，hdv ↔ 其他资料。
 */

const MEDIA_ORIGIN = 'https://media.hdcxb.net/hdcx'; // workers/media-proxy，路径带桶名 hdcx
const BOX_ORIGIN = 'https://box.hdcxb.net/p';

const BOX_DIRS = { jmy: '禅修班', hdv: '其他资料' };
const BUCKET_DIRS = { 禅修班: 'jmy', 其他资料: 'hdv' };

const WASABI_URL = /^https:\/\/(?:s3\.ap-northeast-1\.wasabisys\.com\/hdcx|hdcx\.s3\.ap-northeast-1\.wasabisys\.com)\/(jmy|hdv)\/(.+)$/;
const BOX_URL = /^https:\/\/box\.hdcxb\.net\/[dp]\/(禅修班|其他资料)\/(.+)$/;

/** 返回 [{ line, url }]，按优先级排列；不认识的地址只有它自己，line 为 null */
export function mediaSources(src) {
  const wasabi = WASABI_URL.exec(src);
  const box = wasabi ? null : BOX_URL.exec(src);
  if (!wasabi && !box) return [{ line: null, url: src }];

  const dir = wasabi ? wasabi[1] : BUCKET_DIRS[box[1]];
  const path = (wasabi || box)[2];
  return [
    { line: 'media', url: `${MEDIA_ORIGIN}/${dir}/${path}` },
    { line: 'box', url: `${BOX_ORIGIN}/${BOX_DIRS[dir]}/${path}` },
    { line: 'origin', url: src },
  ];
}

/** 从 preferredLine 开始轮转一圈，仍然试遍所有线路 */
export function sourceQueue(src, preferredLine) {
  const sources = mediaSources(src);
  const start = Math.max(sources.findIndex((s) => s.line === preferredLine), 0);
  return [...sources.slice(start), ...sources.slice(0, start)];
}
