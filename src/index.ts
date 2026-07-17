import chalk from 'chalk';
import inquirer from 'inquirer';
import { GitHelper } from './git';
import { Config } from './config';
import { AIClient } from './ai';
import { DiffProcessor } from './diff';
import { CliOptions, LzcConfig } from './types';

export async function main(options: CliOptions = {}): Promise<void> {
  const git = new GitHelper();
  const configManager = new Config();

  const repoRoot = await git.getRepoRoot();
  await configManager.load(repoRoot);

  const baseConfig = configManager.get();
  const finalConfig: LzcConfig = {
    ...baseConfig,
    ...(options.yes !== undefined && { autoCommit: options.yes }),
    ...(options.lang && { language: options.lang }),
    ...(options.model && { model: options.model }),
    ...(options.style && { commitStyle: options.style }),
    apiKey: configManager.getApiKey(),
    baseUrl: configManager.getBaseUrl()
  };

  console.log(chalk.blue('🔍 正在分析暂存区的变更...\n'));

  const diff = await git.getStagedDiff();
  const diffLines = diff.split('\n').length;
  console.log(chalk.gray(`发现约 ${diffLines} 行变更（${diff.length} 字符）\n`));

  // diff 预处理：过滤噪音文件，超出字符预算时按文件粒度截断
  const stat = await git.getStagedDiffStat();
  const processor = new DiffProcessor(finalConfig);
  const processed = processor.process(diff, stat);

  if (processed.excludedFiles.length > 0) {
    console.log(chalk.yellow(`📦 已排除 ${processed.excludedFiles.length} 个噪音文件（锁文件/构建产物等），仅在统计中保留`));
  }
  if (processed.truncated) {
    console.log(chalk.yellow(`✂️  diff 超出预算，已按文件粒度截断：${processed.keptFiles}/${processed.totalFiles} 个文件保留完整内容，输入约 ${processed.text.length} 字符`));
  }
  if (processed.excludedFiles.length > 0 || processed.truncated) {
    console.log();
  }

  console.log(chalk.blue('🤖 正在生成 commit message...\n'));

  const ai = new AIClient(finalConfig);
  const commitMessage = await ai.generateCommitMessage(processed.text);

  console.log(chalk.green('生成的 commit message:'));
  console.log(chalk.white('─'.repeat(50)));
  console.log(commitMessage);
  console.log(chalk.white('─'.repeat(50)));
  console.log();

  if (options.dryRun) {
    console.log(chalk.yellow('📋 Dry-run 模式，未执行 commit'));
    return;
  }

  // 提交失败（如 commitlint 校验不通过）时保留 message，便于修正后手动提交
  const tryCommit = async (message: string): Promise<void> => {
    try {
      await git.commit(message);
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  提交失败。commit message 如下，可修正后手动执行 git commit：\n'));
      console.log(message);
      console.log();
      throw error;
    }
  };

  let shouldCommit = finalConfig.autoCommit;

  if (!shouldCommit) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '是否使用这个 commit message?',
        choices: [
          { name: '✅ 确认提交', value: 'commit' },
          { name: '✏️  编辑后提交', value: 'edit' },
          { name: '❌ 取消', value: 'cancel' }
        ]
      }
    ]);

    if (action === 'cancel') {
      console.log(chalk.yellow('已取消'));
      return;
    }

    if (action === 'edit') {
      const { editedMessage } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'editedMessage',
          message: '编辑 commit message:',
          default: commitMessage
        }
      ]);

      if (!editedMessage || editedMessage.trim() === '') {
        console.log(chalk.yellow('消息为空，已取消'));
        return;
      }

      await tryCommit(editedMessage.trim());
      return;
    }

    shouldCommit = true;
  }

  if (shouldCommit) {
    await tryCommit(commitMessage);
  }
}
