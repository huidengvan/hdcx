import React from 'react';

export default class MyPara extends React.Component {
    constructor() {
        super();
        this.state = {
            startX: 0,
        };
        this.navRef = null;
        this.articleRef = null;
        this.colors = [
            { name: '褐色', color: '#FFF2E2' },
            { name: '绿色', color: '#CCE8CF' },
            { name: '黄色', color: '#F8FD89' },
            { name: '白色', color: 'white' }
        ];
        this.colorIndex = 0;
    }

    handleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }

        if (this.navRef.style.display == 'none') {
            this.navRef.style.display = 'block'; // 显示导航
            this.articleRef.style.fontSize = 'medium'
        } else {
            this.navRef.style.display = 'none'; // 隐藏导航
            this.articleRef.style.fontSize = 'x-large'
        }
    }

    componentDidMount() {
        // Changing the state after 3 sec
        // console.log('componentDidMount document ready  is called');
        const myarticle = document.getElementsByTagName("article")[0]
        // console.log(myarticle);
        var line = 1;
        const nodes = myarticle.getElementsByTagName("p");
        // console.log(nodes);
        for (const element of nodes) {
            //    nodes.forEach(element => {
            // console.log('p' + line + ' ' + element.innerText);
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
        this.articleRef = document.querySelector('#__docusaurus')

        window.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('dblclick', this.handleFullscreen);
        document.addEventListener('contextmenu', function (event) {
            if (document.fullscreenElement || /iPad|iPhone|Android|Mobile/.test(navigator.userAgent)) {
                event.preventDefault();
                window.scrollBy(0, window.innerHeight - 50); // 下一页
            }
        });

        const article = document.querySelector('article');
        article.addEventListener('touchstart', this.handleTouchStart);
        article.addEventListener('touchend', this.handleTouchEnd);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = (event) => {
        if (event.key === 'f') {
            this.handleFullscreen()
        } else if (event.key === 'ArrowLeft') {
            window.scrollBy(0, 50 - window.innerHeight);
        } else if (event.key === 'ArrowRight') {
            window.scrollBy(0, window.innerHeight - 50);
        } else if (event.key === 'b') {
            this.articleRef.style.backgroundColor = this.colors[this.colorIndex].color;
            this.colorIndex = (this.colorIndex + 1) % this.colors.length;
        }
    }

    handleTouchStart = (event) => {
        this.setState({ startX: event.touches[0].clientX });
    };

    handleTouchEnd = (event) => {
        const { startX } = this.state;
        const endX = event.changedTouches[0].clientX;
        const distance = endX - startX;

        if (distance > 30) {
            // console.log('向右滑动上一页');
            window.scrollBy(0, 50 - window.innerHeight);
        } else if (distance < -30) {
            // console.log('向左滑动下一页');
            window.scrollBy(0, window.innerHeight - 50);
        }
    }

    render() {
        return <></>
    }
}

function createElementFromHTML(htmlString) {
    var div = document.createElement('div');
    div.innerHTML = htmlString.trim();

    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
}