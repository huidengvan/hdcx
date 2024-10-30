

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

export function getRxlSection(lesson) {
    const sections = [
        { range: [1, 14], section: '01' },
        { range: [15, 28], section: '02' },
        { range: [29, 35], section: '03' },
        { range: [36, 46], section: '04' },
        { range: [47, 69], section: '05' },
        { range: [70, 94], section: '06' },
        { range: [95, 110], section: '07' },
        { range: [111, 152], section: '08' },
        { range: [153, 190], section: '09' },
        { range: [191, 201], section: '10' },
    ];

    const foundSection = sections.find(({ range }) => lesson >= range[0] && lesson <= range[1]);
    return foundSection ? foundSection.section : undefined;
}

export function getRxlEndNode(location) {
    const targetName = decodeURI(location.hash.substring(1));
    const match = targetName?.match(/入菩萨行论第(\d+)节课/);
    if (!match) return;

    const specialEndNodes = {
        '14': 'p833',
        '28': 'p841',
        '35': 'p374',
        '46': 'p567',
        '69': 'p1500',
        '94': 'p1945',
        '110': 'p1444',
        '152': 'p3881',
        '190': 'p4320',
        '201': 'p1311'
    };

    const lessonNumber = match[1];
    const endNode = specialEndNodes[lessonNumber] || `入菩萨行论第${parseInt(lessonNumber) + 1}节课`;

    if (/p\d+/.test(endNode)) {
        return getTargetNode(endNode.slice(1));
    }
    return document.getElementById(endNode)?.previousElementSibling;
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

export const copyText = async (text) => {
    const msgEl = document.querySelector(`.${styles['subtitle-switch']}`);
    try {
        await navigator.clipboard.writeText(text);
        msgEl?.classList.add(`${styles['show-copied']}`);
        setTimeout(() => msgEl?.classList.remove(`${styles['show-copied']}`), 1000)
        return true;
    } catch (err) {
        return false;
    }
}

export const subFullscreen = (ref) => {
    if (!document.fullscreenElement) {
        ref.current.style.overflowY = 'hidden'
        subRef.current.requestFullscreen()
    } else {
        ref.current.style.overflowY = 'auto'
        document.exitFullscreen()
    }
}

export const parseTime = (timeString) => {
    if (!timeString) return timeString

    if (timeString?.split(':').length == 1) {
        return parseInt(timeString)
    }

    if (timeString?.split(':').length == 2) {
        timeString = '00:' + timeString
    }
    const parts = timeString?.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]?.replace(',', '.'));
    return hours * 3600 + minutes * 60 + (seconds || 0);
};

export const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = String(totalSeconds % 60);

    // 格式化为两位数
    const formattedHours = String(hours).padStart(2, '0') + ':';
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds?.split('.')[0]).padStart(2, '0');
    const formattedMillSeconds = seconds?.split('.')[1]?.slice(0, 3);

    return `${formattedHours}${formattedMinutes}:${formattedSeconds},${formattedMillSeconds}`;
};

export const parseSubtitles = (data, duration, src, keqianTime) => {
    // console.log({ data, src });
    if (!data) return;

    let matchRxl = src?.match(/入行论广解(\d+)课/);
    let matchRxlQa = /入行论广解\d+-\d+课问答/.test(src)

    const subtitlesArray = [];
    let subtitleLines = data.trim()?.split(new RegExp('\r?\n\r?\n'));
    if (matchRxlQa) {
        subtitleLines = subtitleLines.slice(21)
    }

    subtitleLines.forEach((line) => {
        const parts = line.trim()?.split(new RegExp('\r?\n'));
        const index = parts[0];
        const time = parts[1]?.split(' --> ');
        const text = parts.slice(2).join('\n');
        let timeStart = time[0]

        if ((matchRxl || matchRxlQa) && parseTime(timeStart) > keqianTime + 5) {
            timeStart = matchRxlQa ?
                parseTime(timeStart) + (duration - 2868) :
                parseTime(timeStart) + (duration - 2870)

            timeStart = formatTime(timeStart)
        }

        subtitlesArray.push({ index, startTime: timeStart, endTime: time[1], text });
    });

    return subtitlesArray;
};

export const fetchText = async (suburl) => {
    try {
        const response = await fetch(suburl);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.text();
        if (!data.includes('failed')) {
            return data;
        }
        return ''
    } catch (e) {
        console.error(e);
    }
};