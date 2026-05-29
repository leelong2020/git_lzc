import chalk from 'chalk';
import inquirer from 'inquirer';
import { GitHelper } from './git';
import { Config } from './config';
import { AIClient } from './ai';
import { CliOptions, LzcConfig } from './types';

export async function main(options: CliOptions = {}): Promise<void> {
  const git = new GitHelper();
  const configManager = new Config();

  const repoRoot = await git.getRepoRoot();
  configManager.load(repoRoot);

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
  console.log(chalk.gray(`发现约 ${diffLines} 行变更\n`));

  let diffInput = diff;
  if (diffLines > 300) {
    const stat = await git.getStagedDiffStat();
    const truncatedLines = diff.split('\n').slice(0, 200).join('\n');
    diffInput = `变更统计：\n${stat}\n\n主要变更内容（已截断）：\n${truncatedLines}\n...（后续 ${diffLines - 200} 行已省略）`;
    console.log(chalk.yellow(`diff 行数过多，已截断为前 200 行并附加变更统计\n`));
  }

  console.log(chalk.blue('🤖 正在生成 commit message...\n'));

  const ai = new AIClient(finalConfig);
  const commitMessage = await ai.generateCommitMessage(diffInput);

  console.log(chalk.green('生成的 commit message:'));
  console.log(chalk.white('─'.repeat(50)));
  console.log(commitMessage);
  console.log(chalk.white('─'.repeat(50)));
  console.log();

  if (options.dryRun) {
    console.log(chalk.yellow('📋 Dry-run 模式，未执行 commit'));
    return;
  }

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

      await git.commit(editedMessage.trim());
      return;
    }

    shouldCommit = true;
  }

  if (shouldCommit) {
    await git.commit(commitMessage);
  }
}
