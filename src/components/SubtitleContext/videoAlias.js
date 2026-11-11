/**
 * 课程视频的短地址：/video/b1/1-02-1 ↔ 慧灯禅修课第一册/02-1 三殊胜（上）.mp4
 * 写法与法本 /books/b1/1-02 一致：册号-课号[-第几个视频]，省略最后一段时取该课的第一个视频。
 * 文件名不写在代码里，按网盘（Alist）目录里文件名开头的编号现查。
 */

const BOX_LIST_API = 'https://box.hdcxb.net/api/fs/list';
const BOX_ROOT = '/禅修课视频';

export const BOOK_DIRS = { b1: '慧灯禅修课第一册', b2: '慧灯禅修课第二册', b3: '慧灯禅修课第三册', b4: '慧灯禅修课第四册' };
export const DIR_BOOKS = Object.fromEntries(Object.entries(BOOK_DIRS).map(([book, dir]) => [dir, book]));

const ALIAS_PATH = /\/video\/(b\d)\/([^/]+)\/?$/;
const MEDIA_FILE = /\.(mp4|webm|mp3|m4a)$/i;

// 文件名开头的编号：“02-1 三殊胜（上）.mp4” → “02-1”
const fileKey = (name) => (name.match(/^\d\d(?:-\d+)?/) || [])[0];

const listCache = {};

/** 某一册目录下的视频/音频文件名，按网盘的顺序；同一册只请求一次 */
export function listBookVideos(book) {
    if (!listCache[book]) {
        listCache[book] = fetch(BOX_LIST_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: `${BOX_ROOT}/${BOOK_DIRS[book]}`, page: 1, per_page: 0 }),
        })
            .then((res) => res.json())
            .then((json) => {
                if (json.code !== 200) throw new Error(json.message);
                return (json.data?.content || [])
                    .filter((item) => !item.is_dir && MEDIA_FILE.test(item.name))
                    .map((item) => item.name);
            })
            .catch((e) => {
                delete listCache[book]; // 失败不缓存，下次重试
                throw e;
            });
    }
    return listCache[book];
}

/** 从地址栏路径取出 { book, id }，不是短地址时返回 null */
export function parseAliasPath(pathname) {
    const [, book, id] = safeDecodeComponent(pathname).match(ALIAS_PATH) || [];
    return BOOK_DIRS[book] ? { book, id } : null;
}

/** 在文件名列表里找 id 对应的文件：编号完全相同的优先，否则取该课的第一个 */
export function resolveAlias(names, book, id) {
    // “1-02-1” 去掉册号得 “02-1”；直接写 “02-1” 也认
    const key = id.replace(new RegExp(`^${book.slice(1)}-(?=\\d\\d)`), '');
    return names.find((name) => fileKey(name) === key)
        || names.find((name) => fileKey(name)?.startsWith(`${key}-`));
}

/** 文件名对应的短地址（b1/1-02-1）；没有编号、或编号重复而解析不回这个文件时返回 null */
export function aliasOf(names, book, name) {
    const key = fileKey(name);
    if (!key) return null;
    const id = `${book.slice(1)}-${key}`;
    return resolveAlias(names, book, id) === name ? `${book}/${id}` : null;
}

function safeDecodeComponent(str) {
    try {
        return decodeURIComponent(str);
    } catch (e) {
        return str;
    }
}

/** 与 name 同一课（开头两位课号相同）的所有文件；只有一个或没有课号时返回空数组 */
export function lessonParts(names, name) {
    const lesson = fileKey(name)?.slice(0, 2);
    if (!lesson) return [];
    const parts = names.filter((n) => fileKey(n)?.slice(0, 2) === lesson);
    return parts.length > 1 ? parts : [];
}
