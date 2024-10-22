import React from 'react';
import toast, { Toaster } from 'react-hot-toast';

export default class MyPara extends React.Component {
    constructor() {
        super();
        this.state = {
        };
        this.navRef = null;
        this.articleRef = null;
        this.colors = [
            { name: '褐色', color: '#FFF2E2' },
            { name: '绿色', color: '#CCE8CF' },
            { name: '黄色', color: '#F8FD89' },
            { name: '白色', color: 'white' }
        ];
        this.colorIndex = -1;
        this.autoPage = false;
        this.endNodeName = null;
        this.duration = null;
    }

    handleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
        this.handleWidescreen()
    }
    handleWidescreen = () => {
        if (this.navRef.style.display !== 'none') {
            // console.log('宽屏阅读模式');
            this.navRef.style.display = 'none'; // 隐藏导航
            document.body.style.scale = '1.72'
        } else {
            this.navRef.style.display = 'block'; // 显示导航
            document.body.style.scale = '1'
        }

        if (window.location.hash) {
            window.location = window.location.href;
        }
    }

    prevParagraph = () => {
        let targetNode = getTargetNode()
        if (!targetNode || location.hash?.slice(2) == 1) return;
        let nextPara = parseInt(targetNode.name.slice(1)) - 1
        location.hash = `p${nextPara}`
    }

    nextParagraph = () => {
        let targetNode = getTargetNode()
        if (!targetNode || !/\d+/.test(location.hash?.slice(1))) return;
        let nextPara = parseInt(targetNode.name.slice(1)) + 1

        if (`p${nextPara}` == this.endNodeName) {
            this.autoPage = false
            console.log(`自动阅读停止`);
        }
        location.hash = `p${nextPara}`
    }

    autoNextParagraph = (speed) => {
        if (this.autoPage === false) {
            return;
        }
        let targetNode = getTargetNode()
        const textLength = targetNode.nextSibling.length;
        const pagiTime = Math.round(textLength / speed);
        // console.log(`${targetNode.name}文本长度为: ${textLength} 停留时间为: ${pagiTime}秒`);
        setTimeout(() => {
            this.nextParagraph()
            this.autoNextParagraph(speed)
        }, pagiTime * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000))

    }

    handleHashChange() {
        let targetNode = getTargetNode()
        if (targetNode) {
            const targetRect = targetNode.getBoundingClientRect();
            const offset = window.innerHeight / 2;
            const targetScrollPosition = window.scrollY + targetRect.top - offset;
            window.scrollTo({
                top: targetScrollPosition,
            });
        }
    }
    async autoPaginate() {
        let speed = await this.calcAudioSpeed()

        if (this.autoPage == true) {
            this.autoPage = false;
        } else {
            this.autoPage = true;
        }

        if (speed > 1) {
            this.handleWidescreen()
            this.autoNextParagraph(speed)
            toast(`${this.autoPage ? '开始' : '暂停'}自动阅读`);
            console.log(`${this.autoPage ? '开始' : '暂停'}自动阅读`);
            console.log('text speed', speed);
        }
    }

    /**
     * 该课文稿字数 / （音频时长 - 课前课后诵的时长）
     * @returns 语速：秒/字
     */
    async calcAudioSpeed() {
        const startNode = getTargetNode(); // 开始段落的a节点
        let endNode = getRxlEndNode() // 结束段落的a节点
        // console.log({ endNode });
        if (!endNode) return;

        endNode = filterFootnote(endNode)
        endNode?.name && (this.endNodeName = endNode.name)
        let totalWordCount = startNode.parentElement.lastChild.length;

        if (startNode && endNode) {
            // 创建一个临时元素来获取 startNode 和 endNode 之间的所有文本
            let currentNode = startNode.parentElement.firstChild; // 当前段落的a节点
            // 遍历 startNode 和 endNode 之间的所有节点
            // parseInt(currentNode?.name?.slice(1)), parseInt(endNode?.name?.slice(1))
            while (currentNode && parseInt(currentNode?.name?.slice(1)) < parseInt(endNode?.name?.slice(1))) {
                totalWordCount += currentNode.parentElement.lastChild.length;
                currentNode = currentNode.parentElement.nextSibling.firstChild;
            }
            console.log({ totalWordCount, duration: this.duration }, startNode.name, endNode.name);

            return Math.round(totalWordCount / this.duration * 1000) / 1000
        }

        return -1;
    }
    componentDidMount() {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        this.duration = urlParams.get('duration');
        if (this.duration) {
            setTimeout(() => this.autoPaginate())
        }

        const myarticle = document.getElementsByTagName("article")[0]
        var line = 1;
        const nodes = myarticle.getElementsByTagName("p");
        for (const element of nodes) {
            var hrefNode = createElementFromHTML("<a name='p" +
                line +
                "' href='#p" +
                line +
                "' style='font-size: 80%;'>[p" +
                line +
                "]</a>");
            element.prepend(hrefNode);
            line++;
        };
        if (window.location.hash) {
            window.location = window.location.href;
        }

        this.navRef = document.querySelector('nav')
        this.articleRef = document.querySelector('article').parentElement.parentElement
        let bgColorIndex = localStorage.getItem('bgColorIndex')
        if (bgColorIndex) {
            this.colorIndex = bgColorIndex
            this.articleRef.style.backgroundColor = this.colors[bgColorIndex].color;
        }
        window.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('dblclick', this.handleFullscreen);
        window.addEventListener('hashchange', this.handleHashChange);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = async (event) => {
        if (event.altKey && (event.key === 't' || event.key === 'T')) {
            this.handleWidescreen()
        } else if (event.altKey && (event.key === 'f' || event.key === 'F')) {
            event.preventDefault()
            handleFullscreen()
        } else if (event.altKey && event.key === 'j') {
            this.nextParagraph()
        } else if (event.altKey && event.key === 'k') {
            this.prevParagraph()
        } else if (event.altKey && (event.key === 'a' || event.key === 'A')) {
            event.preventDefault()
            this.autoPaginate()
        } else if (event.key === 'ArrowUp') {
            window.scrollBy(0, -window.innerHeight / 4);
        } else if (event.key === 'ArrowDown') {
            window.scrollBy(0, window.innerHeight / 4);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            window.scrollBy(0, 50 - window.innerHeight);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            window.scrollBy(0, window.innerHeight - 50);
        } else if (event.altKey && (event.key === 'b' || event.key === 'B')) {
            this.colorIndex = (this.colorIndex + 1) % this.colors.length;
            localStorage.setItem('bgColorIndex', this.colorIndex)
            this.articleRef.style.backgroundColor = this.colors[this.colorIndex].color;
        }
    }

    render() {
        return <Toaster />
    }
}

function createElementFromHTML(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

function getTargetNode() {
    let targetName = location.hash.substring(1)
    if (/p\d+/.test(targetName)) {
        return document.querySelector(`a[name="${targetName}"]`)
    }
    return document.getElementById(decodeURI(targetName))?.nextElementSibling?.firstChild
}

function getRxlEndNode() {
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
        return document.querySelector(`a[name="${endNode}"]`)
    }
    return document.getElementById(endNode)?.previousElementSibling?.firstElementChild

}

function filterFootnote(node) {
    if (!node) return;

    if (node.parentElement.previousElementSibling.tagName === 'HR') {

        return node.parentElement.previousElementSibling?.previousElementSibling.firstChild
    }

    if (!/\[\d+\]/.test(node.nextSibling?.textContent)) {
        return node
    }

    return filterFootnote(node.parentElement.previousElementSibling.firstChild)

}