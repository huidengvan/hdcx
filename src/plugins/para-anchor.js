import { visit, SKIP } from 'unist-util-visit'

// 注意：段落计数规则（全部 <p> 依次编号）被 AI 搜索与关键词搜索索引依赖，修改会导致搜索跳转错位
export default function paraAnchor() {
    return (tree) => {
        let line = 1;
        visit(tree, 'element', (node) => {
            if (node.tagName === 'p') {
                // 保留段落原有属性，仅设置 id
                node.properties = { ...node.properties, id: `p${line}` };
                const alink = {
                    type: 'element',
                    tagName: 'a',
                    properties: { href: `#p${line}` },
                    children: [{ type: 'text', value: `[p${line}] `}],
                }
                node.children = [alink, ...node.children]
                line++
                // <p> 内不会再嵌套 <p>，无需深入子节点
                return SKIP
            }
        });
    }
}
