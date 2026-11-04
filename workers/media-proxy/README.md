# media-proxy

Wasabi 存储桶 `hdcx` 的只读缓存代理，用来改善音视频等文件在中国的加载速度。

`https://media.hdcxb.net/hdcx/<路径>` 等同于 `https://s3.ap-northeast-1.wasabisys.com/hdcx/<路径>`，路径与上游完全相同，只支持 `GET`、`HEAD`、`OPTIONS`。`BUCKET` 以外的路径一律返回 404。

## 部署

```bash
pnpm media:install
pnpm media:deploy
```

域名在 `wrangler.toml` 的 `routes` 中配置，部署时自动绑定。`workers_dev` 已关闭：`*.workers.dev` 在中国大陆基本打不开，而且 Cache API 只保证在自定义域名上生效。

本地调试用 `pnpm media:dev`，默认监听 `http://127.0.0.1:8787`。

## 工作方式

文件按 `CHUNK_MB`（默认 4 MiB）对齐切成分片，每片单独存入 Cache API，再按客户端的 Range 拼接返回。不整文件缓存，是因为 `cache.put` 不接受 206，单个对象也不能超过 512 MB。

- **拖动进度**：只回源用到的分片。
- **播放**：一次响应最多经手 `MAX_CHUNKS` 片（默认 20 片，80 MiB）。`bytes=0-` 这类请求只返回这部分，播放器读完会接着请求后面的内容。
- **下载（不带 Range）**：返回完整文件，超出 `MAX_CHUNKS` 的部分直接回源，不进缓存。
- **覆盖同名文件**：分片的缓存键含 ETag，元数据过期后（`META_TTL`，默认 1 小时）自动换用新分片。
- **上传新文件**：之前访问过的路径，404 最多缓存 `MISSING_TTL`（默认 60 秒）。

响应头 `X-Media-Cache` 表示第一片是否命中缓存（`HIT` / `MISS`）。

## 限制

- **Free 计划限额**：每天 10 万次请求，每请求 50 次 Cache API 调用。`MAX_CHUNKS` 按这个限额取值，升级 Paid 后可调大。
- **缓存只在单个数据中心内有效**：Cache API 不跨机房复制，也不兼容 Tiered Cache，每个机房第一次访问都要回源。
- **服务条款**：Cloudflare 要求非 Enterprise 用户通过指定的付费服务提供视频和大文件，否则可能限制访问，见 [Service-Specific Terms](https://www.cloudflare.com/service-specific-terms-application-services/)。条款未点名 Workers，流量大时要留意。
- **中国大陆没有节点**：普通计划的 Cloudflare 流量不经大陆节点，访问会落到海外机房，速度取决于用户线路。全量替换链接前，先用大陆网络实测。

## 接入前端

先用一个文件在大陆网络下对比速度，第二次请求看到 `X-Media-Cache: HIT` 后的结果才算数：

```bash
curl -o /dev/null -w '%{speed_download}\n' -H 'Range: bytes=0-4194303' 'https://media.hdcxb.net/hdcx/hdv/v/%E5%87%BA%E5%9D%90.mp4'
```

```bash
curl -o /dev/null -w '%{speed_download}\n' -H 'Range: bytes=0-4194303' 'https://s3.ap-northeast-1.wasabisys.com/hdcx/hdv/v/%E5%87%BA%E5%9D%90.mp4'
```

确认有效后，把域名 `s3.ap-northeast-1.wasabisys.com` 替换成 `media.hdcxb.net` 即可，路径不变；要回退到直连，把域名换回去。`src/components/SubtitleContext/index.jsx` 里还有一处虚拟主机写法 `https://hdcx.s3.ap-northeast-1.wasabisys.com/...`，要改成 `https://media.hdcxb.net/hdcx/...`。
