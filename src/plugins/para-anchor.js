import { visit } from 'unist-util-visit'

export default function paraAnchor() {
    return (tree) => {
        let line = 1;
        visit(tree, 'element', (node) => {
            if (node.tagName == 'p') {
                node.properties = { id: `p${line}` };
                line++
            }
        });
    }
}