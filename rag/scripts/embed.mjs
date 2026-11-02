/**
 * 生成向量的服务（模型均为 bge-m3，两边向量实测余弦相似度 0.9999，可混用）：
 *   - cf：Cloudflare Workers AI，每天 1 万 Neurons 免费（北京时间 8 点重置）；可设 Neurons 预算，用完即停
 *   - sf：EMBED_API_URL（硅基流动 /v1/embeddings，模型 BAAI/bge-m3），免费但有并发 / 速率限制，单路串行请求
 * 批量入库时可两边同时跑（--embed both），分摊 Workers AI 额度。
 */
import { EMBED_MODEL, loadEnv, cfFetch } from './lib.mjs';

const CF_BATCH = 20;
const SF_BATCH = 16;
const SF_MODEL = 'BAAI/bge-m3';
// 首个文档前按字数估算 Neurons（实测约 0.65 token/字，1,075 Neurons / 百万 token），之后用实际消耗校正
const INITIAL_NEURONS_PER_CHAR = 0.0008;

export class QuotaExhausted extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cloudflare(budget) {
    const env = loadEnv();
    const p = {
        name: 'Cloudflare',
        batch: CF_BATCH,
        neurons: 0,
        chars: 0,
        // 预算内才接新文档（文档要么整篇写入，要么不动）
        canAfford(chars) {
            if (!budget) return true;
            const rate = p.chars ? p.neurons / p.chars : INITIAL_NEURONS_PER_CHAR;
            return p.neurons + chars * rate <= budget;
        },
        async embed(texts) {
            let result;
            try {
                result = await cfFetch(env, `/ai/run/${EMBED_MODEL}`, { method: 'POST', body: { text: texts } });
            } catch (err) {
                // 当日免费额度用完（4006 daily free allocation）
                if (/allocation|neurons|4006/i.test(err.message)) throw new QuotaExhausted(err.message);
                throw err;
            }
            p.neurons += result.meta?.neurons || 0;
            p.chars += texts.reduce((n, t) => n + t.length, 0);
            return result.data || result.response;
        },
        summary: () => `Cloudflare 用 ${Math.round(p.neurons)} Neurons`,
    };
    return p;
}

function siliconflow() {
    loadEnv();
    const { EMBED_API_URL, EMBED_API_KEY } = process.env;
    if (!EMBED_API_URL || !EMBED_API_KEY) throw new Error('缺少 EMBED_API_URL / EMBED_API_KEY，请在 .env.local 中配置');
    const p = {
        name: '硅基流动',
        batch: SF_BATCH,
        tokens: 0,
        canAfford: () => true,
        async embed(texts) {
            for (let attempt = 1; ; attempt++) {
                let res;
                try {
                    res = await fetch(EMBED_API_URL, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${EMBED_API_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: SF_MODEL, input: texts, encoding_format: 'float' }),
                    });
                } catch (err) {
                    if (attempt >= 8) throw err;
                    await sleep(2000 * attempt);
                    continue;
                }
                const json = await res.json().catch(() => null);
                if (res.ok && json?.data) {
                    p.tokens += json.usage?.total_tokens || 0;
                    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
                }
                // 限流或服务端错误：退避重试（限流时等待更久）
                if ((res.status === 429 || res.status >= 500) && attempt < 8) {
                    await sleep((res.status === 429 ? 5000 : 2000) * attempt);
                    continue;
                }
                throw new Error(`硅基流动 → ${res.status} ${JSON.stringify(json)?.slice(0, 200)}`);
            }
        },
        summary: () => `硅基流动 用 ${p.tokens} tokens`,
    };
    return p;
}

/**
 * @param {'cf' | 'sf' | 'both'} which
 * @param {number} [budget] Cloudflare Neurons 预算（0 或不传为不限）
 */
export function createEmbedders(which = 'cf', budget = 0) {
    if (!['cf', 'sf', 'both'].includes(which)) throw new Error(`--embed 只能是 cf / sf / both`);
    return [...(which !== 'sf' ? [cloudflare(budget)] : []), ...(which !== 'cf' ? [siliconflow()] : [])];
}

/** 整篇文档生成向量 */
export async function embedDoc(p, texts) {
    const vectors = [];
    for (let i = 0; i < texts.length; i += p.batch) {
        const part = texts.slice(i, i + p.batch);
        const v = await p.embed(part);
        if (v?.length !== part.length) throw new Error(`${p.name} 返回的向量数量与输入不符`);
        vectors.push(...v);
    }
    return vectors;
}
