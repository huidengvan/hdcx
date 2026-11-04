/**
 * Wasabi 存储桶 hdcx 的只读缓存代理，解决音视频在中国加载慢的问题
 * GET/HEAD /hdcx/<对象路径>：等同于 ORIGIN/hdcx/<对象路径>，支持 Range、If-Range、If-None-Match
 * 路径与上游相同，替换链接时只需换域名；只放行 BUCKET 下的路径，否则会变成同一节点上所有公开桶的代理
 *
 * 文件按 CHUNK_MB 对齐切成分片，每片单独存入 Cache API，再按客户端的 Range 拼接返回：
 * - cache.put 不接受 206，单个对象又不能超过 512MB，大视频无法整文件缓存
 * - 拖动进度只回源用到的分片，不会把整个文件从 Wasabi 拉一遍
 * - 分片的缓存键含 ETag，同名文件被覆盖后，元数据过期时自动换用新分片，不会新旧混拼
 *
 * Free 计划每个请求最多 50 次 Cache API 调用、50 个子请求，分片未命中时每片要 match + put 两次，
 * 所以一次响应最多经手 MAX_CHUNKS 片：
 * - 带 Range 的请求（播放器）：只返回这部分（RFC 9110 允许），播放器读完会接着请求后面的，整个文件都能进缓存
 * - 不带 Range 的请求（下载）：必须给全文件，超出部分用一个子请求直接回源，这部分不进缓存
 */

const MIB = 1024 * 1024;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, ETag, X-Media-Cache',
    'Access-Control-Max-Age': '86400',
};

/** 回源时读到的 ETag 与元数据不一致：文件刚被覆盖，元数据已删除，重新处理一次即可 */
class StaleMetaError extends Error {}

const text = (body, status, headers = {}) =>
    new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...headers } });

const cacheable = (ttl, headers = {}) => ({ headers: { 'Cache-Control': `public, max-age=${ttl}`, ...headers } });

/** %e6 与 %E6 是同一个文件（正文链接里两种都有），统一成大写，避免同一文件缓存两份 */
const normalizePath = (pathname) => pathname.replace(/%[0-9a-f]{2}/gi, (s) => s.toUpperCase());

/** 必须是桶内的对象；编码过的斜杠可能被上游还原成 ../ 跳出存储桶，一律拒绝 */
const isAllowedPath = (path, bucket) =>
    path.startsWith(`/${bucket}/`) && !path.endsWith('/') && !/%2F|%5C/.test(path);

/** 绕过 fetch 自带的缓存：否则 mp4 等扩展名的 Range 回源可能被放大成拉取整个文件 */
const fetchOrigin = (c, init = {}) => fetch(c.origin + c.path, { ...init, cache: 'no-store' });

function context(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    return {
        ctx,
        path,
        cache: caches.default,
        origin: env.ORIGIN.replace(/\/+$/, ''),
        chunkSize: Number(env.CHUNK_MB) * MIB,
        maxChunks: Number(env.MAX_CHUNKS),
        chunkTtl: Number(env.CHUNK_TTL),
        metaTtl: Number(env.META_TTL),
        missingTtl: Number(env.MISSING_TTL),
        clientTtl: Number(env.CLIENT_TTL),
        // 缓存键用本站域名下的内部路径，外部请求不会直接读到
        metaKey: `${url.origin}/__cache/meta${path}`,
        chunkKey: (etag, index) => `${url.origin}/__cache/chunk/${etag.replace(/\W/g, '')}/${index}${path}`,
    };
}

/** 对象的大小、ETag 等，先查缓存，没有再向上游发 HEAD；404/403 也短暂缓存，避免无效路径反复回源 */
async function getMeta(c) {
    const hit = await c.cache.match(c.metaKey);
    if (hit) return hit.json();

    const res = await fetchOrigin(c, { method: 'HEAD' });
    if (res.status >= 500) return { status: 502 };
    const meta = res.ok
        ? {
              status: 200,
              size: Number(res.headers.get('Content-Length')),
              etag: res.headers.get('ETag'),
              type: res.headers.get('Content-Type') || 'application/octet-stream',
              lastModified: res.headers.get('Last-Modified'),
              disposition: res.headers.get('Content-Disposition'),
          }
        : { status: res.status };
    const ttl = res.ok ? c.metaTtl : c.missingTtl;
    c.ctx.waitUntil(c.cache.put(c.metaKey, new Response(JSON.stringify(meta), cacheable(ttl))));
    return meta;
}

/** 解析单段 Range，返回 { start, end }；无效或多段时返回 null（按 RFC 忽略），越界时返回 'unsatisfiable' */
function parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
    if (!m || (m[1] === '' && m[2] === '')) return null;
    if (m[1] === '') {
        const suffix = Number(m[2]);
        return suffix === 0 ? 'unsatisfiable' : { start: Math.max(size - suffix, 0), end: size - 1 };
    }
    const start = Number(m[1]);
    const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size) return 'unsatisfiable';
    return end < start ? null : { start, end };
}

const bodyOf = (bytes) => new Response(bytes).body;

/**
 * 取第 index 片的 [from, to]（片内偏移，含两端），返回 { body, hit }
 * 未命中时整片读入内存再写缓存，不用 tee：客户端慢或中途断开都不影响分片写入，切片也不必逐块处理（省 CPU）
 */
async function loadChunk(c, meta, index, from, to) {
    const key = c.chunkKey(meta.etag, index);
    const chunkStart = index * c.chunkSize;
    const length = Math.min(c.chunkSize, meta.size - chunkStart);
    const whole = from === 0 && to === length - 1;

    const hit = await c.cache.match(whole ? key : new Request(key, { headers: { Range: `bytes=${from}-${to}` } }));
    if (hit) return { body: hit.body, hit: true };

    const res = await fetchOrigin(c, { headers: { Range: `bytes=${chunkStart}-${chunkStart + length - 1}` } });
    if (res.status !== 206 && res.status !== 200) throw new Error(`upstream ${res.status}`);
    if (res.headers.get('ETag') !== meta.etag) {
        await res.body?.cancel();
        await c.cache.delete(c.metaKey);
        throw new StaleMetaError();
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength !== length) throw new Error(`short read: ${bytes.byteLength}/${length}`);

    c.ctx.waitUntil(
        c.cache.put(key, new Response(bytes, cacheable(c.chunkTtl, { 'Content-Length': String(length) }))),
    );
    return { body: bodyOf(new Uint8Array(bytes, from, to - from + 1)), hit: false };
}

/** 返回按片号取 [start, end] 对应内容的函数：首尾两片只取落在范围内的部分 */
function chunkLoader(c, meta, start, end) {
    const firstIndex = Math.floor(start / c.chunkSize);
    const lastIndex = Math.floor(end / c.chunkSize);
    return (index) => {
        const chunkStart = index * c.chunkSize;
        const from = index === firstIndex ? start - chunkStart : 0;
        const to = (index === lastIndex ? end + 1 : Math.min(chunkStart + c.chunkSize, meta.size)) - chunkStart - 1;
        return loadChunk(c, meta, index, from, to);
    };
}

/** 依次写入 firstIndex~lastIndex 片（第一片 first 已取好），发送当前片时预取下一片；有 tail 时其余部分直接回源 */
async function pump(c, load, first, firstIndex, lastIndex, tail, writable) {
    try {
        let current = Promise.resolve(first);
        for (let index = firstIndex; index <= lastIndex; index++) {
            const { body } = await current;
            current = index < lastIndex ? load(index + 1) : null;
            current?.catch(() => {});
            await body.pipeTo(writable, { preventClose: index < lastIndex || tail !== null });
        }
        if (tail) {
            const res = await fetchOrigin(c, { headers: { Range: tail } });
            if (res.status !== 206) throw new Error(`upstream ${res.status}`);
            await res.body.pipeTo(writable);
        }
    } catch (err) {
        // 客户端断开也会走到这里；中途出错时中止连接，播放器会用 Range 重新请求
        await writable.abort(err).catch(() => {});
    }
}

async function handle(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') return text('Method Not Allowed', 405, { Allow: 'GET, HEAD, OPTIONS' });

    const c = context(request, env, ctx);
    if (!isAllowedPath(c.path, env.BUCKET)) return text('Not Found', 404);

    const meta = await getMeta(c);
    if (meta.status !== 200) return text(meta.status === 502 ? 'Bad Gateway' : 'Not Found', meta.status === 502 ? 502 : 404);

    const headers = {
        ...CORS,
        'Accept-Ranges': 'bytes',
        // no-transform：防止 Cloudflare 压缩文本类文件，压缩后 Content-Length 和 Range 偏移都对不上
        'Cache-Control': `public, max-age=${c.clientTtl}, no-transform`,
        'Content-Type': meta.type,
        ETag: meta.etag,
        'X-Content-Type-Options': 'nosniff',
    };
    if (meta.lastModified) headers['Last-Modified'] = meta.lastModified;
    if (meta.disposition) headers['Content-Disposition'] = meta.disposition;

    if (request.headers.get('If-None-Match') === meta.etag) return new Response(null, { status: 304, headers });

    const ifRange = request.headers.get('If-Range');
    const rangeValid = !ifRange || ifRange === meta.etag || ifRange === meta.lastModified;
    const range = rangeValid ? parseRange(request.headers.get('Range'), meta.size) : null;
    if (range === 'unsatisfiable') {
        return text('Range Not Satisfiable', 416, { 'Content-Range': `bytes */${meta.size}` });
    }

    if (request.method === 'HEAD' || meta.size === 0) {
        return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': String(meta.size) } });
    }

    const start = range ? range.start : 0;
    const requestedEnd = range ? range.end : meta.size - 1;
    const cachedEnd = (Math.floor(start / c.chunkSize) + c.maxChunks) * c.chunkSize - 1;
    const end = Math.min(requestedEnd, cachedEnd);
    const tailEnd = range ? end : requestedEnd;

    // 第一片在返回响应头之前取好，上游出错时还能返回错误状态码，而不是一条中断的 200
    const firstIndex = Math.floor(start / c.chunkSize);
    const load = chunkLoader(c, meta, start, end);
    const first = await load(firstIndex);

    const tail = tailEnd > end ? `bytes=${end + 1}-${tailEnd}` : null;
    const { readable, writable } = new FixedLengthStream(tailEnd - start + 1);
    ctx.waitUntil(pump(c, load, first, firstIndex, Math.floor(end / c.chunkSize), tail, writable));

    headers['Content-Length'] = String(tailEnd - start + 1);
    headers['X-Media-Cache'] = first.hit ? 'HIT' : 'MISS';
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${meta.size}`;
    return new Response(readable, { status: range ? 206 : 200, headers });
}

export default {
    async fetch(request, env, ctx) {
        try {
            try {
                return await handle(request, env, ctx);
            } catch (err) {
                if (err instanceof StaleMetaError) return await handle(request, env, ctx);
                throw err;
            }
        } catch (err) {
            console.error(err);
            return text('Bad Gateway', 502);
        }
    },
};
