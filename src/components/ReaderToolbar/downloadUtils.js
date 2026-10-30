import toast from 'react-hot-toast';

// ─── 离线文档下载底层工具函数 ──────────────────────────────────

/** XML 特殊字符转义 */
export function escapeXml(unsafe) {
    return String(unsafe || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** 触发浏览器 Blob 文件直接下载 */
export function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 300);
}

/** 获取当前文章元信息与正文 DOM */
export function getArticleMetadata() {
    const h1 = document.querySelector('article h1') || document.querySelector('h1');
    const rawTitle = h1?.innerText?.trim() || document.title.split('|')[0].trim() || '电子书';
    const cleanTitle = rawTitle.replace(/^#+\s*/g, '').replace(/[\r\n]/g, '').trim();
    const safeFilename = cleanTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || 'book';
    const contentEl = document.querySelector('.theme-doc-markdown') || document.querySelector('article');
    return { title: cleanTitle, filename: safeFilename, contentEl };
}

/** 提取排版工整的纯文本（严格剥离 Markdown 语法标记） */
export function extractPlainText(title, contentElement, includeAnchors) {
    let plain = `${title}\n${'='.repeat(Math.min(Math.max(title.length * 2, 10), 50))}\n\n`;
    let firstH1Skipped = false;

    function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            let t = node.textContent;
            t = t.replace(/(^|\n)#{1,6}\s+/g, '$1');
            if (!includeAnchors) {
                t = t.replace(/\[p\d+\]\s*/g, '');
            }
            return t;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName.toLowerCase();
        if (['script', 'style', 'button', 'noscript', 'svg'].includes(tag) ||
            node.classList.contains('hash-link') ||
            node.classList.contains('clean-btn') ||
            node.classList.contains('theme-doc-footer') ||
            node.classList.contains('pagination-nav') ||
            node.classList.contains('breadcrumbs')) {
            return '';
        }

        if (!includeAnchors) {
            const href = node.getAttribute('href') || '';
            if (tag === 'a' && (href.startsWith('#p') || /^\[p\d+\]/.test(node.textContent.trim()))) {
                return '';
            }
        }

        let text = '';
        for (const child of node.childNodes) {
            text += walk(child);
        }

        if (/^h[1-6]$/.test(tag)) {
            const cleanHeading = text.replace(/^#+\s*/g, '').trim();
            // 严格跳过正文中的首个主标题 h1，避免与最顶部的文档总标题重复输出
            if (tag === 'h1' && (!firstH1Skipped || cleanHeading === title.trim())) {
                firstH1Skipped = true;
                return '';
            }
            return `\n\n${cleanHeading}\n\n`;
        } else if (tag === 'p') {
            return `\n\n${text.trim()}\n`;
        } else if (tag === 'li') {
            return `\n• ${text.trim()}`;
        } else if (tag === 'blockquote') {
            return `\n\n> ${text.trim()}\n\n`;
        } else if (tag === 'pre') {
            return `\n\n${node.textContent.trim()}\n\n`;
        } else if (tag === 'hr') {
            return '\n\n----------------------------------------\n\n';
        } else if (tag === 'br') {
            return '\n';
        }
        return text;
    }

    plain += walk(contentElement);
    return plain.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** 将 DOM 序列化为规范的 XHTML（供 EPUB 标准使用） */
export function serializeToXhtml(node, includeAnchors) {
    if (node.nodeType === Node.TEXT_NODE) {
        let t = node.textContent;
        if (!includeAnchors) {
            t = t.replace(/\[p\d+\]\s*/g, '');
        }
        return escapeXml(t);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'button', 'noscript', 'svg'].includes(tag) ||
        node.classList.contains('hash-link') ||
        node.classList.contains('clean-btn') ||
        node.classList.contains('theme-doc-footer') ||
        node.classList.contains('pagination-nav') ||
        node.classList.contains('breadcrumbs')) {
        return '';
    }

    if (!includeAnchors) {
        const href = node.getAttribute('href') || '';
        if (tag === 'a' && (href.startsWith('#p') || /^\[p\d+\]/.test(node.textContent.trim()))) {
            return '';
        }
    }

    if (['br', 'hr', 'img'].includes(tag)) {
        let attrs = '';
        for (const attr of node.attributes) {
            if (attr.name.startsWith('on') || attr.name.startsWith('data-')) continue;
            attrs += ` ${attr.name}="${escapeXml(attr.value)}"`;
        }
        if (tag === 'img' && !node.getAttribute('alt')) {
            attrs += ' alt=""';
        }
        return `<${tag}${attrs} />`;
    }

    let hasOpen = false;
    let attrs = '';
    for (const attr of node.attributes) {
        if (attr.name.startsWith('on') || attr.name.startsWith('data-')) continue;
        if (attr.name === 'open') {
            hasOpen = true;
            attrs += ' open="open"';
            continue;
        }
        if (attr.name === 'style') {
            // 彻底剥离 Docusaurus 内部 React 折叠组件注入的行内隐藏样式与固定文本颜色，允许深色模式自适应
            const cleaned = attr.value
                .replace(/display\s*:\s*none;?/gi, '')
                .replace(/height\s*:\s*0(px)?;?/gi, '')
                .replace(/overflow\s*:\s*hidden;?/gi, '')
                .replace(/will-change\s*:[^;]+;?/gi, '')
                .replace(/color\s*:[^;]+;?/gi, '')
                .trim();
            if (cleaned) {
                attrs += ` style="${escapeXml(cleaned)}"`;
            }
            continue;
        }
        if (tag === 'a' && attr.name === 'href') {
            const val = attr.value || '';
            const hashIdx = val.indexOf('#');
            if (hashIdx !== -1) {
                const prefix = val.slice(0, hashIdx);
                const hashPart = val.slice(hashIdx + 1);
                const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
                // 如果是页内锚点（以 # 开头），或者链接路径指向当前页面自身
                if (val.startsWith('#') || !prefix || prefix === currentPath || (currentPath && prefix.endsWith(currentPath))) {
                    try {
                        const decodedHash = decodeURIComponent(hashPart);
                        attrs += ` href="chapter1.xhtml#${escapeXml(decodedHash)}"`;
                    } catch (e) {
                        attrs += ` href="chapter1.xhtml#${escapeXml(hashPart)}"`;
                    }
                    continue;
                }
            }
        }
        attrs += ` ${attr.name}="${escapeXml(attr.value)}"`;
    }

    // 在 EPUB 电子书中强制展开 <details> 目录
    if (tag === 'details' && !hasOpen) {
        attrs += ' open="open"';
    }

    let children = '';
    for (const child of node.childNodes) {
        children += serializeToXhtml(child, includeAnchors);
    }

    return `<${tag}${attrs}>${children}</${tag}>`;
}

// ─── 导出具体格式功能函数 ──────────────────────────────────

/** 动态安全加载 JSZip 库（走 CDN 脚本注入，避免 Webpack 动态代码分块 404/html 语法错误） */
export async function loadJSZip() {
    if (typeof window !== 'undefined' && window.JSZip) {
        return window.JSZip;
    }
    return new Promise((resolve, reject) => {
        let script = document.getElementById('dynamic-jszip-script');
        if (!script) {
            script = document.createElement('script');
            script.id = 'dynamic-jszip-script';
            script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            script.async = true;
            document.head.appendChild(script);
        }
        if (window.JSZip) {
            return resolve(window.JSZip);
        }
        script.addEventListener('load', () => {
            if (window.JSZip) resolve(window.JSZip);
            else reject(new Error('JSZip 加载异常'));
        });
        script.addEventListener('error', () => {
            reject(new Error('无法连接 CDN 加载 JSZip 库，请检查网络'));
        });
    });
}

/** 1. 导出 TXT 纯文本 */
export function exportTxt(includeAnchors) {
    const { title, filename, contentEl } = getArticleMetadata();
    if (!contentEl) {
        toast.error('未找到文章正文内容');
        return;
    }

    try {
        const plainText = extractPlainText(title, contentEl, includeAnchors);
        const blob = new Blob(['\uFEFF' + plainText], { type: 'text/plain;charset=utf-8' });
        triggerBlobDownload(blob, `${filename}.txt`);
        toast.success('TXT 纯文本下载完成');
    } catch (err) {
        console.error('TXT 生成失败:', err);
        toast.error('TXT 生成失败，请重试');
    }
}

/** 展开文档内所有 details 折叠框（确保 PDF 打印与移动端 WebKit 完整渲染内联目录） */
export function expandAllDetails() {
    if (typeof document === 'undefined') return;

    const allDetails = Array.from(
        document.querySelectorAll('article details, main details, details')
    );

    allDetails.forEach(d => {
        // 如果处于折叠状态，尝试模拟触发 summary 点击以唤醒 Docusaurus React 状态解冻
        const isCollapsed = d.getAttribute('data-collapsed') === 'true' || !d.open;
        if (isCollapsed) {
            const summary = d.querySelector('summary');
            if (summary) {
                try {
                    summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } catch (e) {}
            }
        }

        d.setAttribute('open', '');
        d.open = true;
        d.setAttribute('data-collapsed', 'false');

        // 无论此前是否有行内样式，强制将内部全部容器和列表项设为可见流式布局
        const innerNodes = d.querySelectorAll('*');
        innerNodes.forEach(el => {
            const tag = el.tagName.toLowerCase();
            if (tag === 'li') {
                el.style.setProperty('display', 'list-item', 'important');
            } else if (tag === 'a') {
                el.style.setProperty('display', 'inline', 'important');
            } else if (tag !== 'summary') {
                el.style.setProperty('display', 'block', 'important');
            }
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('height', 'auto', 'important');
            el.style.setProperty('max-height', 'none', 'important');
            el.style.setProperty('overflow', 'visible', 'important');
        });
    });

    // 强制触发 DOM 几何回流，确保 WebKit 渲染树即时计算展开后的布局尺寸
    void document.body.offsetHeight;
}

// 注册全局打印前置钩子：无论用户是通过侧边栏点击导出还是直接通过 Safari 系统菜单分享打印，均自动展开目录
if (typeof window !== 'undefined') {
    window.addEventListener('beforeprint', expandAllDetails);
}

/** 2. 导出 PDF（调起系统静默打印流） */
export function exportPdf(includeAnchors, onBeforePrint) {
    if (onBeforePrint) onBeforePrint();

    const { filename } = getArticleMetadata();
    const originalTitle = document.title;

    // 1. 自动展开正文与主区域内的全部 details 折叠框（确保 iPhone Safari 等移动端打印预览完整呈现目录）
    expandAllDetails();

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.title = originalTitle;
        document.body.classList.remove('hide-print-anchors');
        window.removeEventListener('afterprint', cleanup);
    };

    // 仅在真实打印流结束（afterprint）时复原页面标题与锚点样式
    // 严禁在 iOS Safari 弹窗期间通过定时器或 blur/focus 提早收起折叠框，确保打印快照永远捕获完整展开的目录
    window.addEventListener('afterprint', cleanup, { once: true });

    try {
        if (!includeAnchors) {
            document.body.classList.add('hide-print-anchors');
        } else {
            document.body.classList.remove('hide-print-anchors');
        }

        document.title = filename;

        // 留出 400ms 让移动端 WebKit 完成重排与渲染，随后调起打印流
        setTimeout(() => {
            expandAllDetails();
            window.print();
        }, 400);
    } catch (err) {
        console.error('PDF 打印调起失败:', err);
        cleanup();
        toast.error('PDF 打印调起失败');
    }
}

/** 3. 导出 EPUB 电子书（按需动态拉取 JSZip） */
export async function exportEpub(includeAnchors) {
    const { title, filename, contentEl } = getArticleMetadata();
    if (!contentEl) {
        toast.error('未找到文章正文内容');
        return;
    }

    const toastId = toast.loading('正在打包生成 EPUB 电子书...');

    try {
        // 动态加载 JSZip 库，彻底规避 Webpack 动态 chunk 404 返回 HTML 的 SyntaxError 报错
        const JSZip = await loadJSZip();
        const zip = new JSZip();

        // 1. 克隆正文 DOM 树，完全在内存中独立处理 EPUB 专属排版与结构，不污染当前网页
        const clonedEl = contentEl.cloneNode(true);

        // 2. 收集正文中所有的章节标题，分配符合 XML 1.0 规范的纯 ASCII 标识符（sec-1, sec-2...）
        // 彻底解决安卓与 iOS 平台各阅读器（微信读书、苹果图书）因中文或全角标点导致 XML ID 解析失败、点击无反应的根本问题
        const idMap = new Map();
        const headings = Array.from(clonedEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        const navEntries = [];

        headings.forEach((h, index) => {
            const rawId = h.getAttribute('id') || h.id || '';
            const safeId = `sec-${index + 1}`;
            if (rawId) {
                idMap.set(rawId, safeId);
                try {
                    idMap.set(decodeURIComponent(rawId), safeId);
                } catch (e) {}
            }
            h.setAttribute('id', safeId);
            h.id = safeId;

            const text = h.innerText.replace(/^#+\s*/, '').replace(/\[p\d+\]/g, '').trim();
            navEntries.push({ id: safeId, text: text || `章节 ${index + 1}` });
        });

        // 3. 将网页端的交互式折叠框 <details><summary>目录</summary>...</details> 重构为电子书标准的静态目录区块
        // 彻底杜绝移动端（iOS / Android）阅读器手势拦截导致的目录链接点不动，以及深色模式下 <summary> 颜色发黑无法看清的问题
        const detailsList = Array.from(clonedEl.querySelectorAll('details'));
        detailsList.forEach(details => {
            const summary = details.querySelector('summary');
            const summaryText = summary?.innerText?.trim() || '目录';

            const tocContainer = document.createElement('div');
            tocContainer.className = 'epub-toc-box';

            const tocTitle = document.createElement('h2');
            tocTitle.className = 'epub-toc-title';
            tocTitle.innerText = summaryText;
            tocContainer.appendChild(tocTitle);

            // 将 details 内部的目录列表节点移入静态容器
            const children = Array.from(details.childNodes);
            children.forEach(child => {
                if (child !== summary) {
                    tocContainer.appendChild(child);
                }
            });

            details.parentNode?.replaceChild(tocContainer, details);
        });

        // 4. 重写克隆树中的所有超链接：精准对齐至 chapter1.xhtml#sec-X
        const links = Array.from(clonedEl.querySelectorAll('a'));
        links.forEach(a => {
            const href = a.getAttribute('href') || '';
            const hashIdx = href.indexOf('#');
            if (hashIdx !== -1) {
                const rawHash = href.slice(hashIdx + 1);
                let decodedHash = rawHash;
                try {
                    decodedHash = decodeURIComponent(rawHash);
                } catch (e) {}

                const mappedId = idMap.get(rawHash) || idMap.get(decodedHash);
                if (mappedId) {
                    a.setAttribute('href', `chapter1.xhtml#${mappedId}`);
                } else if (rawHash.startsWith('p') && /^\d+$/.test(rawHash.slice(1))) {
                    if (!includeAnchors) {
                        a.remove();
                    } else {
                        a.setAttribute('href', `chapter1.xhtml#${rawHash}`);
                    }
                }
            }
        });

        // EPUB 规范 1: mimetype 必须非压缩存储
        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

        // EPUB 规范 2: META-INF
        zip.folder('META-INF').file(
            'container.xml',
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
        );

        const oebps = zip.folder('OEBPS');

        // EPUB 规范 3: CSS 样式表（遵循电子书自适应规范，严禁硬编码纯黑纯白以完美兼容白天/黑夜模式）
        const cssContent = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.8;
  margin: 1.2em;
  color: inherit;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
  margin-top: 1.3em;
  margin-bottom: 0.6em;
  font-weight: 700;
  color: inherit;
}
p {
  margin: 0.9em 0;
  text-align: justify;
  text-indent: 2em;
  color: inherit;
}
blockquote {
  margin: 1.2em 0;
  padding: 0.6em 1em;
  border-left: 3px solid rgba(125, 125, 125, 0.4);
  background-color: rgba(125, 125, 125, 0.08);
  color: inherit;
}
pre, code {
  font-family: monospace;
  background-color: rgba(125, 125, 125, 0.1);
  font-size: 0.9em;
  color: inherit;
}
pre {
  padding: 0.8em;
  overflow-x: auto;
  border-radius: 4px;
}
/* 电子书正文内嵌目录区块排版（完美支持微信读书与苹果图书深色模式） */
.epub-toc-box {
  margin: 1.5em 0;
  padding: 12px 18px;
  border: 1px solid rgba(125, 125, 125, 0.25);
  border-radius: 8px;
  background-color: rgba(125, 125, 125, 0.05);
  color: inherit;
}
.epub-toc-title {
  font-size: 1.15em;
  font-weight: 700;
  margin: 0 0 10px 0 !important;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(125, 125, 125, 0.2);
  color: inherit;
}
.table-of-contents, ul.table-of-contents {
  list-style: disc;
  padding-left: 20px;
  margin: 8px 0;
  color: inherit;
}
.table-of-contents li {
  margin: 6px 0;
  line-height: 1.6;
  color: inherit;
}
.table-of-contents a {
  color: inherit !important;
  text-decoration: underline;
  text-decoration-color: rgba(125, 125, 125, 0.4);
  cursor: pointer;
  display: inline-block;
  padding: 3px 0;
}
.table-of-contents ul {
  list-style: circle;
  padding-left: 20px;
  margin: 4px 0;
  color: inherit;
}
/* 深色阅读模式全平台色彩适配（支持微信读书、苹果图书及各大安卓阅读器） */
@media (prefers-color-scheme: dark) {
  body {
    color: #e5e7eb !important;
  }
  .epub-toc-box {
    background-color: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.18);
  }
  .epub-toc-title,
  .table-of-contents,
  .table-of-contents li,
  .table-of-contents a {
    color: #e5e7eb !important;
  }
}
`;
        oebps.file('style.css', cssContent);

        // EPUB 规范 4: 正文 XHTML
        const xhtmlBody = serializeToXhtml(clonedEl, includeAnchors);
        // 如果正文已经包含主标题 h1，则不重复添加顶部标题
        const hasH1 = !!clonedEl.querySelector('h1');
        const headerHtml = hasH1 ? '' : `<h1>${escapeXml(title)}</h1>`;
        const chapterContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="chapter-content">
    ${headerHtml}
    ${xhtmlBody}
  </div>
</body>
</html>`;
        oebps.file('chapter1.xhtml', chapterContent);

        // EPUB 规范 5: 目录 toc.xhtml（EPUB 3 原生导航大纲）与 toc.ncx（EPUB 2 兼容导航，完美支持微信读书与老版阅读器）
        let navList = '';
        let ncxNavMap = '';

        if (navEntries.length > 0) {
            navList = navEntries
                .map((entry) => `      <li><a href="chapter1.xhtml#${escapeXml(entry.id)}">${escapeXml(entry.text)}</a></li>`)
                .join('\n');

            ncxNavMap = navEntries
                .map((entry, i) => `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel>
        <text>${escapeXml(entry.text)}</text>
      </navLabel>
      <content src="chapter1.xhtml#${escapeXml(entry.id)}"/>
    </navPoint>`)
                .join('\n');
        } else {
            navList = `      <li><a href="chapter1.xhtml">${escapeXml(title)}</a></li>`;
            ncxNavMap = `    <navPoint id="navPoint-1" playOrder="1">
      <navLabel>
        <text>${escapeXml(title)}</text>
      </navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>`;
        }

        const tocContent = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>目录</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录</h1>
    <ol>
${navList}
    </ol>
  </nav>
</body>
</html>`;
        oebps.file('toc.xhtml', tocContent);

        // EPUB 2 NCX 导航文件（微信读书与旧版阅读器必备）
        const uuid = 'urn:uuid:' + Math.random().toString(36).substring(2, 15);
        const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
${ncxNavMap}
  </navMap>
</ncx>`;
        oebps.file('toc.ncx', ncxContent);

        // EPUB 规范 6: 元数据清单 content.opf（配置 spine toc="ncx"，兼顾 EPUB 2/3 国际规范）
        const dateStr = new Date().toISOString().replace(/\.[0-9]+Z$/, 'Z');
        const opfContent = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>禅修班</dc:creator>
    <meta property="dcterms:modified">${dateStr}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`;
        oebps.file('content.opf', opfContent);

        const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/epub+zip',
        });

        triggerBlobDownload(blob, `${filename}.epub`);
        toast.success('EPUB 电子书打包完成', { id: toastId });
    } catch (err) {
        console.error('EPUB 打包生成失败:', err);
        toast.error('EPUB 打包失败，请重试', { id: toastId });
    }
}
