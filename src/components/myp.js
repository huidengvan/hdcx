import React from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { getVideoDuration } from './Playlist';

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
    }

    handleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
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
        location.hash = `p${nextPara}`
    }

    autoNextParagraph = (speed) => {
        if (this.autoPage === false) {
            return;
        }
        let targetNode = getTargetNode()
        const textLength = targetNode.nextSibling.length;
        const pagiTime = Math.ceil(textLength / speed) + 3;
        // console.log(`${targetNode.name}文本长度为: ${textLength} 停留时间为: ${pagiTime}秒`);
        setTimeout(() => {
            this.nextParagraph()
            this.autoNextParagraph(speed)
        }, pagiTime * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000))

    }

    handleHashChange() {
        let targetNode = getTargetNode()
        if (targetNode) {
            const offset = window.innerHeight / 2 - targetNode.clientHeight / 2 - 200;
            window.scrollTo({
                top: targetNode.getBoundingClientRect().top + window.scrollY - offset
            });
        }
    }
    async autoPaginate() {
        let speed = await this.calcAudioSpeed()
        console.log({ 语速: speed });
        if (speed > 1) this.autoNextParagraph(speed)
        toast(`${this.autoPage ? '开始' : '暂停'}自动阅读`);
    }

    /**
     * 该课文稿字数 / （音频时长 - 课前课后诵的时长）
     * @returns 语速：秒/字
     */
    async calcAudioSpeed() {
        const p1 = getTargetNode(); // 开始段落的a节点
        let targetName = decodeURI(location.hash.substring(1))
        const match = targetName?.match(/入菩萨行论第(\d+)节课/);
        console.log(match);
        if (!match) return;
        let endNode;
        if (targetName == '入菩萨行论第14节课') {
            endNode = `p833`
        } else if (targetName == '入菩萨行论第28节课') {
            endNode = `p841`
        } else if (targetName == '入菩萨行论第35节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第46节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第69节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第94节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第110节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第152节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第190节课') {
            endNode = `p1311`
        } else if (targetName == '入菩萨行论第201节课') {
            endNode = `p1311`
        } else {
            endNode = `入菩萨行论第${parseInt(match[1]) + 1}节课`
        }
        const p2 = getTargetNode(endNode); // 结束段落的a节点
        this.endNodeName = p2.name
        let totalWordCount = p1.parentElement.lastChild.length;
        console.log({ endNode, p2 });

        if (p1 && p2) {
            // 创建一个临时元素来获取 p1 和 p2 之间的所有文本
            let currentNode = p1.parentElement.firstChild; // 当前段落的a节点
            // 遍历 p1 和 p2 之间的所有节点
            // parseInt(currentNode?.name?.slice(1)), parseInt(p2?.name?.slice(1))
            while (currentNode && parseInt(currentNode?.name?.slice(1)) < parseInt(p2?.name?.slice(1))) {
                totalWordCount += currentNode.parentElement.lastChild.length;
                currentNode = currentNode.parentElement.nextSibling.firstChild;
            }
            let duration = await getVideoDuration(`https://box.hdcxb.net/d/慧灯禅修/001-入行论释/fudao/全部音频/入行论广解${match[1]?.padStart(3, '0')}课.mp3`)
            console.log({ totalWordCount, duration }, p1.name, p2.name);

            return Math.round((totalWordCount / (duration - 220)) * 1000) / 1000
        }
    }
    componentDidMount() {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        this.autoPage = urlParams.get('autoPage');

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
        this.articleRef = document.querySelector('article')
        let bgColorIndex = localStorage.getItem('bgColorIndex')
        if (bgColorIndex) {
            this.colorIndex = bgColorIndex
            this.articleRef.style.backgroundColor = this.colors[bgColorIndex].color;
        }
        if (this.autoPage) {
            setTimeout(() => {
                this.autoPaginate()
            }, 88 * (localStorage.getItem('playbackRate') == 2 ? 500 : 1000))
        }
        window.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('dblclick', this.handleFullscreen);
        document.addEventListener('fullscreenchange', () => {
            if (window.location.hash) {
                window.location = window.location.href;
            }
            if (!document.fullscreenElement) {
                this.navRef.style.display = 'block'; // 显示导航
                document.body.style.scale = '1'
            } else {
                this.navRef.style.display = 'none'; // 隐藏导航
                document.body.style.scale = '1.71'
            }
        });
        window.addEventListener('hashchange', this.handleHashChange);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = async (event) => {
        if (event.key === 'f' || event.key === 'F') {
            this.handleFullscreen()
        } else if (event.key === 'j') {
            this.nextParagraph()
        } else if (event.key === 'k') {
            this.prevParagraph()
        } else if (event.key === 'a' || event.key === 'A') {
            if (this.autoPage == true) {
                this.autoPage = false;
            } else {
                this.autoPage = true;
                this.autoPaginate()
            }
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
        } else if (event.key === 'b' || event.key === 'B') {
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

function getTargetNode(targetName = location.hash.substring(1)) {
    let targetNode = /p\d+/.test(targetName) ?
        document.querySelector(`a[name="${targetName}"]`) :
        document.getElementById(decodeURI(targetName))?.nextElementSibling.firstChild;

    return targetNode
}