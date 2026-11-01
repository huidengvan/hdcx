import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RAG_DIR = path.join(ROOT, 'rag');
export const OUT_DIR = path.join(RAG_DIR, 'out');
export const MANIFEST_PATH = path.join(RAG_DIR, 'manifest.json');

export const EMBED_MODEL = '@cf/baai/bge-m3';
export const DIMENSIONS = 1024;

export const categories = JSON.parse(fs.readFileSync(path.join(RAG_DIR, 'categories.json'), 'utf8')).categories;

// 展平为 group 列表，附带所属分类
// articleHeading：整册单文件的书以该级标题为文章名（如慧灯之光为 2）
export const groups = categories.flatMap((cat) =>
    cat.groups.map((g) => ({ ...g, cat: cat.id, catLabel: cat.label, articleHeading: cat.articleHeading })),
);

// 解析 --key value / --flag 形式的命令行参数
export function parseArgs(argv = process.argv.slice(2)) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const m = argv[i].match(/^--([\w-]+)(?:=(.*))?$/);
        if (!m) continue;
        if (m[2] !== undefined) args[m[1]] = m[2];
        else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[m[1]] = argv[++i];
        else args[m[1]] = true;
    }
    return args;
}

// --only 支持逗号分隔的 group 或文章前缀，如 books/b4 或 books/b4/4-01
export function matchOnly(only, id) {
    if (!only) return true;
    return String(only).split(',').some((p) => id === p || id.startsWith(`${p}/`));
}

export function loadEnv() {
    const file = path.join(ROOT, '.env.local');
    if (fs.existsSync(file)) process.loadEnvFile(file);
    const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, VECTORIZE_INDEX } = process.env;
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
        throw new Error('缺少 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN，请在 .env.local 中配置');
    }
    return { accountId: CLOUDFLARE_ACCOUNT_ID, token: CLOUDFLARE_API_TOKEN, indexName: VECTORIZE_INDEX || 'hdcx-rag' };
}

// 调用 Cloudflare REST API，失败时抛出带错误信息的异常（不输出 token）
export async function cfFetch(env, apiPath, { method = 'GET', body, contentType = 'application/json', allow404 = false } = {}) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.accountId}${apiPath}`;
    const backoff = (attempt) => new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    for (let attempt = 1; ; attempt++) {
        let res;
        try {
            res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${env.token}`, ...(body ? { 'Content-Type': contentType } : {}) },
                body: body && contentType === 'application/json' ? JSON.stringify(body) : body,
            });
        } catch (err) {
            // 网络错误（连接重置、TLS 握手失败等）同样退避重试
            if (attempt < 5) {
                console.warn(`网络错误，${2 ** attempt} 秒后重试（${err.cause?.code || err.message}）`);
                await backoff(attempt);
                continue;
            }
            throw err;
        }
        if (allow404 && res.status === 404) return null;
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success !== false) return json?.result;
        // 限流或服务端错误时退避重试
        if ((res.status === 429 || res.status >= 500) && attempt < 5) {
            await backoff(attempt);
            continue;
        }
        const msg = json?.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') || res.statusText;
        throw new Error(`${method} ${apiPath} → ${res.status} ${msg}`);
    }
}

export function readJson(file, fallback) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

export function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
