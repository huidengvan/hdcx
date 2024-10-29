import { visit } from 'unist-util-visit'

export default function paraAnchor() {
    let line = 1;
    return (tree) => {
        visit(tree, 'element', (node) => {
            if (node.tagName == 'p') {
                node.properties = { id: `p${line}` };
                line++
            }
        });
    }
}