/**
 * 法语搜索 API 服务
 */

const DEFAULT_API_URL = 'https://fayuapi.hdcxb.net';

/**
 * @typedef {Object} Subtitle
 * @property {number} lineId
 * @property {string} startTime
 * @property {string} text
 */

/**
 * @typedef {Object} SearchItem
 * @property {number} count
 * @property {string} subtitles - JSON stringified Subtitle[]
 * @property {string} title
 * @property {string} series
 * @property {number} [videoId]
 */

/**
 * @typedef {Object} SearchResult
 * @property {number} total
 * @property {number} pageSize
 * @property {number} page
 * @property {SearchItem[]} data
 */

/**
 * 执行法语搜索请求
 * @param {string} keywords 
 * @param {number} page 
 * @returns {Promise<SearchResult>}
 */
export async function searchRequest(keywords, page = 1) {
    const cleanKeywords = (keywords || '')
        .replace(/[,，\/]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    if (!cleanKeywords) {
        return { total: 0, pageSize: 5, page: 1, data: [] };
    }

    const url = `${DEFAULT_API_URL}/search/${encodeURIComponent(cleanKeywords)}/${page}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`搜索请求失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result;
}

/**
 * 格式化时间戳用于播放器跳转
 * 原始格式如 "00:00:35.240" -> 截取到秒 "00:00:35"
 * @param {string} timeStr 
 * @returns {string}
 */
export function formatTimeForUrl(timeStr) {
    if (!timeStr) return '';
    return timeStr.split('.')[0] || timeStr;
}

/**
 * 格式化用于界面友好展示的时间标签
 * "00:00:35.240" -> "00:35"
 * "01:20:04.260" -> "01:20:04"
 * @param {string} timeStr 
 * @returns {string}
 */
export function formatDisplayTime(timeStr) {
    if (!timeStr) return '';
    const withoutMs = timeStr.split('.')[0] || timeStr;
    // 如果小时为 00，则显示 MM:SS，否则显示 HH:MM:SS
    if (withoutMs.startsWith('00:')) {
        return withoutMs.slice(3);
    }
    return withoutMs;
}

/**
 * 生成跳转到视频播放器的 URL
 * @param {string} series 
 * @param {string} title 
 * @param {string} [startTime] 
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
