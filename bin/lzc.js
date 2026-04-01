#!/usr/bin/env node

const { program } = require('commander');
const { main } = require('../dist/index');
const chalk = require('chalk');

program
  .name('lzc')
  .description('Lazy Commit — 用 AI 分析 Git 变更，自动生成规范的 commit message')
  .version('1.0.0')
  .option('-y, --yes', '跳过确认，直接提交')
  .option('-l, --lang <lang>', '指定语言 (en/zh)')
  .option('-d, --dry-run', '只输出 message，不执行 commit')
  .option('-m, --model <model>', '指定模型')
  .option('-s, --style <style>', 'commit 风格 (conventional/free)')
  .parse();

const options = program.opts();

main(options).catch((error: Error) => {
  console.error(chalk.red('❌ 错误:'), error.message);
  process.exit(1);
});
