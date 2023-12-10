export function srtTimestamp(seconds) {
    seconds = seconds - 0;
    let milliseconds = seconds * 1000;

    seconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    milliseconds = milliseconds % 1000;
    seconds = seconds % 60;
    minutes = minutes % 60;
    return (hours < 10 ? '0' : '') + hours + ':'
        + (minutes < 10 ? '0' : '') + minutes + ':'
        + (seconds < 10 ? '0' : '') + seconds + '.'
        + (milliseconds < 100 ? '0' : '') + (milliseconds < 10 ? '0' : '') + parseInt(milliseconds);

}

export function timeToSeconds(time) {
    if (time == undefined) return;
    if (time.indexOf(':') == -1) return time;
    const list = time.split(':');

    if (list.length == 2) {
        let min = list[0];
        let sec = list[1];
        return Number(min * 60) + Number(sec);
    }
    let hour = list[0];
    let min = list[1];
    let sec = list[2];

    return Number(hour * 3600) + Number(min * 60) + Number(sec);


}