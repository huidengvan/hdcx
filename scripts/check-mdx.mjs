/**
 * MDX 兼容性检查（pnpm check）。
 * docusaurus-mdx-checker 默认只排除根目录的 node_modules，workers/* 下各自安装的依赖（wrangler 等）的说明文件
 * 不是 MDX 而会报错，命令行又不能传排除项，所以这里直接调用其 main 并补充排除规则。
 */
import main from 'docusaurus-mdx-checker';
import { DefaultExclude } from 'docusaurus-mdx-checker/src/constants.js';

try {
    console.log(await main({ cwd: process.cwd(), exclude: [...DefaultExclude, '**/node_modules/**', 'build/**', '.docusaurus/**'] }));
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
