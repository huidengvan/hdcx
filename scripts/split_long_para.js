const fs = require('fs');
const path = require('path');

// 读取Markdown文件
const readMarkdownFile = (filePath) => {
    return fs.readFileSync(filePath, 'utf-8');
};

// 写入分段后的Markdown文件
const writeMarkdownFile = (filePath, content) => {
    fs.writeFileSync(filePath, content, 'utf-8');
};

// 超过350字时分段
const splitParagraphs = (text) => {
    const paragraphs = text.split(/\r?\n\r?\n/);
    let result = [];
    console.log(paragraphs.length);

    paragraphs.forEach(paragraph => {
        const length = paragraph.length;

        if (length > 350) {
            let currentLength = 0;
            let lastSplitIndex = 0;
            const sentences = paragraph.split(/(?<=。['"’”〗]?)/);
            const splitPoints = [];

            // 根据段落长度计算分割点
            const divisionPoints = [2, 3].map(divisor => Math.floor(length / divisor));

            sentences.forEach((sentence, index) => {
                currentLength += sentence.length;

                // 检查是否接近分割点
                divisionPoints.forEach(point => {
                    if (currentLength >= point && lastSplitIndex < index) {
                        splitPoints.push(index); // 记录分割点
                        lastSplitIndex = index; // 更新最后的分割索引
                    }
                });
            });

            // 检查有效分割点
            let validSplitIndex = -1;
            for (let index of splitPoints) {
                const segment = sentences.slice(0, index + 1).join('').trim();
                if (segment.length >= 30) {
                    validSplitIndex = index; // 找到有效的分割点
                }
            }
            // 根据有效分割点进行分段
            if (splitPoints.length > 0) {
                let lastIndex = 0; // 用于记录上一个分割点

                splitPoints.forEach(index => {
                    const segment = sentences.slice(lastIndex, index + 1).join('').trim();
                    if (segment.length >= 30) { // 确保段落长度大于等于30
                        result.push(segment); // 添加有效段落
                        lastIndex = index + 1; // 更新上一个分割点
                    }
                });

                // 添加剩余部分
                if (lastIndex < sentences.length) {
                    result.push(sentences.slice(lastIndex).join('').trim());
                }
            }
        } else {
            result.push(paragraph); // 保持原段落不变
        }
    });

    return result.join('\n\n');
};

// 处理指定路径下的所有Markdown文件
const processMarkdownFiles = (inputDir) => {
    const files = fs.readdirSync(inputDir);

    files.forEach(file => {
        const filePath = path.join(inputDir, file);
        if (fs.statSync(filePath).isFile() && file.endsWith('rxl-fd01.md')) {
            // if (fs.statSync(filePath).isFile() && file.endsWith('.md')) {
            const markdownContent = readMarkdownFile(filePath);
            let newContent = splitParagraphs(markdownContent);
            newContent += '\n'
            writeMarkdownFile(filePath, newContent);
            console.log(`Processed: ${file}`);
        }
    });
};

// 主函数
const main = () => {
    const inputDir = path.join(__dirname, '../refs/rxl/fudao');
    processMarkdownFiles(inputDir);
};

main();