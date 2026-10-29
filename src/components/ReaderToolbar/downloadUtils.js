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
            // 彻底剥离 Docusaurus 内部 React 折叠组件注入的行内隐藏样式
            const cleaned = attr.value
                .replace(/display\s*:\s*none;?/gi, '')
                .replace(/height\s*:\s*0(px)?;?/gi, '')
                .replace(/overflow\s*:\s*hidden;?/gi, '')
                .replace(/will-change\s*:[^;]+;?/gi, '')
                .trim();
            if (cleaned) {
                attrs += ` style="${escapeXml(cleaned)}"`;
            }
            continue;
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

/** 2. 导出 PDF（调起系统静默打印流） */
export function exportPdf(includeAnchors, onBeforePrint) {
    if (onBeforePrint) onBeforePrint();

    const { filename } = getArticleMetadata();
    const originalTitle = document.title;

    // 仅在原生 HTML 层面为未打开的折叠框添加 open 属性，绝不侵入修改内部 React 行内样式
    const closedDetails = Array.from(
        document.querySelectorAll('article details:not([open]), main details:not([open])')
    );
    closedDetails.forEach(d => {
        d.setAttribute('open', '');
        d.open = true;
    });

    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        document.title = originalTitle;
        document.body.classList.remove('hide-print-anchors');
        closedDetails.forEach(d => {
            d.removeAttribute('open');
            d.open = false;
        });
        window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    // 保底复原（针对部分移动端浏览器未触发 afterprint 事件的情况，2.5s 足够平滑过渡）
    setTimeout(cleanup, 2500);

    try {
        if (!includeAnchors) {
            document.body.classList.add('hide-print-anchors');
        } else {
            document.body.classList.remove('hide-print-anchors');
        }

        document.title = filename;

        // 留出 120ms 让 React 完成面板收起，随后调起打印
        setTimeout(() => {
            window.print();
        }, 120);
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

        // EPUB 规范 3: CSS 样式表
        const cssContent = `
body {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.8;
  margin: 1.2em;
  color: #222222;
}
h1, h2, h3, h4 {
  line-height: 1.35;
  margin-top: 1.3em;
  margin-bottom: 0.6em;
  font-weight: 700;
  color: #111111;
}
p {
  margin: 0.9em 0;
  text-align: justify;
  text-indent: 2em;
}
blockquote {
  margin: 1.2em 0;
  padding: 0.6em 1em;
  border-left: 3px solid #ccc;
  background-color: #f7f7f7;
  color: #555555;
}
pre, code {
  font-family: monospace;
  background-color: #f3f3f3;
  font-size: 0.9em;
}
pre {
  padding: 0.8em;
  overflow-x: auto;
  border-radius: 4px;
}
details {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 14px;
  margin: 1.2em 0;
  background-color: #f8fafc;
}
details summary {
  font-weight: 700;
  font-size: 1.05em;
  cursor: pointer;
  margin-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 6px;
}
.table-of-contents, ul.table-of-contents {
  list-style: disc;
  padding-left: 20px;
  margin: 8px 0;
}
.table-of-contents li {
  margin: 4px 0;
  line-height: 1.6;
}
.table-of-contents a {
  color: #2563eb;
  text-decoration: none;
}
.table-of-contents ul {
  list-style: circle;
  padding-left: 20px;
  margin: 4px 0;
}
`;
        oebps.file('style.css', cssContent);

        // EPUB 规范 4: 正文 XHTML
        const xhtmlBody = serializeToXhtml(contentEl, includeAnchors);
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
    <h1>${escapeXml(title)}</h1>
    ${xhtmlBody}
  </div>
</body>
</html>`;
        oebps.file('chapter1.xhtml', chapterContent);

        // EPUB 规范 5: 目录 toc.xhtml（提取正文章节生成原生导航大纲）
        const headingEls = Array.from(contentEl.querySelectorAll('h1, h2, h3'));
        let navList = '';
        if (headingEls.length > 0) {
            navList = headingEls
                .map((h, i) => {
                    const id = h.id || `heading-${i}`;
                    const text = h.innerText.replace(/^#+\s*/, '').replace(/\[p\d+\]/g, '').trim();
                    return `      <li><a href="chapter1.xhtml#${escapeXml(id)}">${escapeXml(text)}</a></li>`;
                })
                .join('\n');
        } else {
            navList = `      <li><a href="chapter1.xhtml">${escapeXml(title)}</a></li>`;
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

        // EPUB 规范 6: 元数据清单 content.opf
        const uuid = 'urn:uuid:' + Math.random().toString(36).substring(2, 15);
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
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
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
