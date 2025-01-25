

export const ignoredCharacters = /[【】〖〗\[\]《》：:"'“”]/g;

export const bgColors = [
    { name: '褐色', color: '#FFF2E2' },
    { name: '绿色', color: '#CCE8CF' },
    { name: '黄色', color: '#FAF9DE' },
    { name: '白色', color: 'white' }
];

export const getTargetNode = (target) => document.getElementById(target);

export const locateParagraph = (currentPara) => {
    if (/^\d+$/.test(currentPara)) { currentPara = `p${currentPara}` }
    const targetNode = getTargetNode(currentPara);
    if (targetNode) {
        const scrollBlock = sessionStorage.getItem('scrollBlock');
        targetNode.scrollIntoView({ block: scrollBlock || 'center' });
        targetNode.style.borderLeft = '.5px solid #2e8555'
    }
};

export function getStartNode(targetPara) {
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

export function getRxlEndNode(startPara) {
    const match = startPara?.match(/入菩萨行论第(\d+)节课/);
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
        return getTargetNode(endNode);
    }

    return getTargetNode(endNode)?.previousElementSibling;
}

export function filterFootnote(node) {
    if (!node) return;

    if (node.previousElementSibling.tagName === 'HR') {
        return node.previousElementSibling?.previousElementSibling
    }

    if (/\[\d+\]/.test(node.textContent)) {
        return filterFootnote(node.previousElementSibling)
    }

    return node
}

export function isSameLesson(lesson, title) {
    if (!lesson || !title) return;

    // 检查主题是否包含相同的内容
    const themeCheck = lesson.includes("入菩萨行论") && title.includes("入行论广解");

    // 提取课次
    const lessonNumber1 = lesson.match(/第(\d+)/) ? lesson.match(/第(\d+)/)[1] : null;
    const lessonNumber2 = title.match(/广解(\d+)/) ? title.match(/广解(\d+)/)[1] : null;
    // console.log(themeCheck, lessonNumber1, title,lessonNumber2);

    // 返回主题和课次是否相同
    return themeCheck && parseInt(lessonNumber1) === parseInt(lessonNumber2);
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
        let timeEnd = time[1]

        if ((matchRxl || matchRxlQa) && parseTime(timeStart) > keqianTime + 5) {
            timeStart = formatTime(parseTime(timeStart) + (duration - 2870))
            timeEnd = formatTime(parseTime(timeEnd) + (duration - 2870))
        }

        subtitlesArray.push({ index, startTime: timeStart, endTime: timeEnd, text });
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

export const isShortKesong = (lessonNo) => (['31', '32'].includes(lessonNo) || parseInt(lessonNo) >= 47)

export const getLessonNo = (pathSegment) => pathSegment.match(/广解(\d+)/)[1] 
