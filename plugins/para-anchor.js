'use strict'

const visit = require('unist-util-visit')

function paraAnchor() {
    return (tree) => {
        let line = 1;

        visit(tree, 'element', (node) => {
            const alink = {
                type: 'element',
                tagName: 'a',
                properties: { href: `#p${line}`, id: `p${line}` },
                children: [{ type: 'text', value: `[p${line}]` }],
            }
            if (node.tagName == 'p') {
                node.children = [alink, ...node.children]
                line++
            }
        });
    }
}

module.exports = paraAnchor
