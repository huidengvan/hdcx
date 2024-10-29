

export const ignoredCharacters = /[【】〖〗\[\]《》：:"'“”]/g;

export const bgColors = [
    { name: '褐色', color: '#FFF2E2' },
    { name: '绿色', color: '#CCE8CF' },
    { name: '黄色', color: '#F8FD89' },
    { name: '白色', color: 'white' }
];

export const getTargetNode = (currentPara) => document.getElementById(`p${currentPara}`);

export const locateParagraph = (currentPara, scrollY) => {
    const targetNode = getTargetNode(currentPara);
    if (targetNode) {
        const targetRect = targetNode.getBoundingClientRect();
        const offset = window.innerHeight / 2 + scrollY;
        const targetScrollPosition = window.scrollY + targetRect.top - offset;

        window.scrollTo({ top: targetScrollPosition });
    }
};

export function getStartNode(location) {
    let targetPara = location.hash.slice(1)

    if (/p\d+/.test(targetPara)) {
        return getTargetNode(targetPara.slice(1))
    }
    return document.getElementById(decodeURI(targetPara))?.nextElementSibling
}

export function getRxlEndNode(location) {
    let targetName = decodeURI(location.hash.substring(1))
    const match = targetName?.match(/入菩萨行论第(\d+)节课/);
    // console.log({ match });
    if (!match) return;
    let endNode = `入菩萨行论第${parseInt(match[1]) + 1}节课`

    if (targetName == '入菩萨行论第14节课') {
        endNode = `p833`
    } else if (targetName == '入菩萨行论第28节课') {
        endNode = `p841`
    } else if (targetName == '入菩萨行论第35节课') {
        endNode = `p374`
    } else if (targetName == '入菩萨行论第46节课') {
        endNode = `p567`
    } else if (targetName == '入菩萨行论第69节课') {
        endNode = `p1500`
    } else if (targetName == '入菩萨行论第94节课') {
        endNode = `p1945`
    } else if (targetName == '入菩萨行论第110节课') {
        endNode = `p1444`
    } else if (targetName == '入菩萨行论第152节课') {
        endNode = `p3881`
    } else if (targetName == '入菩萨行论第190节课') {
        endNode = `p4320`
    } else if (targetName == '入菩萨行论第201节课') {
        endNode = `p1311`
    }
    // console.log(document.getElementById(endNode)?.previousElementSibling.firstElementChild);

    if (/p\d+/.test(endNode)) {
        return getTargetNode(endNode.slice(1))
    }
    return document.getElementById(endNode)?.previousElementSibling
}

export function filterFootnote(node) {
    if (!node) return;

    if (node.previousElementSibling.tagName === 'HR') {

        return node.previousElementSibling?.previousElementSibling.firstChild
    }

    if (!/\[\d+\]/.test(node.nextSibling?.textContent)) {
        return node
    }

    return filterFootnote(node.previousElementSibling.firstChild)
}