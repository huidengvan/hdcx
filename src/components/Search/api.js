/**
 * 字幕搜索 API 服务（Cloudflare Worker：workers/fayu-api）
 */

const DEFAULT_API_URL = 'https://fayuapi.hdcxb.net';
// 与 Worker 的 MAX_QUERY_CHARS 一致
const MAX_QUERY_CHARS = 50;

/**
 * SearchCard 使用的字幕行
 * @typedef {Object} Subtitle
 * @property {number} lineId
 * @property {number|string} startTime - 秒数（字幕搜索）或 "00:00:35.240"（AI 搜索）
 * @property {string} text
 * @property {boolean} [hit] - 命中行
 * @property {boolean} [ctx] - 上下文行
 * @property {boolean} [gap] - 与上一组之间加分隔
 * @property {number[][]} [hl] - 高亮区间 [起, 止)，由接口按规范化匹配换算而来（不受空格、繁简影响）
 */

/**
 * @typedef {Object} SearchItem
 * @property {number} count - 匹配处数
 * @property {string} subtitles - JSON stringified Subtitle[]
 * @property {string} title
 * @property {string} series
 * @property {string} book - b1 ~ b4
 */

/**
 * @typedef {Object} SearchResult
 * @property {string[]} terms - 接口规范化后的关键词（去空格、繁转简）
 * @property {number} total - 匹配的视频数
 * @property {number} matches - 匹配处数
 * @property {number} pageSize
 * @property {number} page
 * @property {Record<string, number>} facets - 各册匹配的视频数（不受册筛选影响）
 * @property {SearchItem[]} data
 * @property {boolean} [tooLong]
 */

const emptyResult = (extra) => ({ terms: [], total: 0, matches: 0, pageSize: 10, page: 1, facets: {}, data: [], ...extra });

/**
 * 执行字幕搜索请求
 * @param {string} keywords - 空格分隔多个词，须在同一段话内同时出现
 * @param {number} page
 * @param {string[]} [books] - 册筛选，如 ['b1', 'b3']，空数组表示全部
 * @param {AbortSignal} [signal]
 * @returns {Promise<SearchResult>}
 */
export async function searchRequest(keywords, page = 1, books = [], signal) {
    const q = (keywords || '').trim().replace(/\s+/g, ' ');
    if (!q) return emptyResult();
    // 超出接口上限的长句不再请求，交给界面提示拆词或改用 AI 搜索
    if (q.length > MAX_QUERY_CHARS) return emptyResult({ tooLong: true });

    const params = new URLSearchParams({ q, page: String(page) });
    if (books.length) params.set('b', books.join(','));
    const response = await fetch(`${DEFAULT_API_URL}/search?${params}`, { signal });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
        throw new Error(result?.error || `搜索请求失败: ${response.status} ${response.statusText}`);
    }

    // 字段缺失（如浏览器缓存了旧接口的响应）时按无结果处理，不让页面报错
    const results = Array.isArray(result.results) ? result.results : [];
    return {
        ...emptyResult(),
        ...result,
        // 每组为命中行 ± 上下文：命中行加底色、上下文行淡色，组间加分隔（与 AI 搜索的视频结果一致）
        data: results.map((r) => ({
            book: r.book,
            series: r.series,
            title: r.title,
            count: r.count,
            subtitles: JSON.stringify(
                (r.groups || []).flatMap((lines, gi) =>
                    lines.map((l, li) => ({
                        lineId: l.n,
                        startTime: l.t,
                        text: l.text,
                        ...(l.hl ? { hl: l.hl } : {}),
                        ...(l.hit ? { hit: true } : { ctx: true }),
                        ...(gi > 0 && li === 0 ? { gap: true } : {}),
                    })),
                ),
            ),
        })),
    };
}

const pad = (n) => String(n).padStart(2, '0');

// 秒数或 "00:00:35.240" → "00:00:35"
function toHms(time) {
    if (typeof time === 'number') return `${pad(Math.floor(time / 3600))}:${pad(Math.floor((time % 3600) / 60))}:${pad(time % 60)}`;
    return time.split('.')[0] || time;
}

/**
 * 格式化时间用于播放器跳转：35 或 "00:00:35.240" -> "00:00:35"
 * @param {number|string} time
 * @returns {string}
 */
export function formatTimeForUrl(time) {
    if (time == null || time === '') return '';
    return toHms(time);
}

/**
 * 格式化用于界面友好展示的时间标签
 * 35 / "00:00:35.240" -> "00:35"
 * 4804 / "01:20:04.260" -> "01:20:04"
 * @param {number|string} time
 * @returns {string}
 */
export function formatDisplayTime(time) {
    if (time == null || time === '') return '';
    const hms = toHms(time);
    // 如果小时为 00，则显示 MM:SS，否则显示 HH:MM:SS
    return hms.startsWith('00:') ? hms.slice(3) : hms;
}

/**
 * 生成跳转到视频播放器的 URL
 * @param {string} series
 * @param {string} title
 * @param {number|string} [startTime]
 * @param {string} [baseVideoPath]
 * @returns {string}
 */
export function buildVideoUrl(series, title, startTime, baseVideoPath = '/video') {
    let url = `${baseVideoPath}#${series}/${title}.mp4`;
    if (startTime) {
        url += `#t=${formatTimeForUrl(startTime)}`;
    }
    return url;
}
