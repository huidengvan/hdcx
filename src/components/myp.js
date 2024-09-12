import React from 'react';

export default class MyPara extends React.Component {
    constructor() {
        super();
        this.navRef = null;
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

        window.addEventListener('keydown', this.handleKeyDown);
        this.navRef = document.querySelector('nav')
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = (event) => {
        if (event.key === 'f') {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }

            if (this.navRef.style.display == 'none') {
                this.navRef.style.display = 'block'; // 显示导航
            } else {
                this.navRef.style.display = 'none'; // 显示导航
            }
        } else if (event.key === 'ArrowLeft') {
            window.scrollBy(0, 50 - window.innerHeight);
        } else if (event.key === 'ArrowRight') {
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