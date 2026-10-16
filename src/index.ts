import chalk from 'chalk';
import inquirer from 'inquirer';
import { GitHelper, CommitError } from './git';
import { Config } from './config';
import { AIClient } from './ai';
import { DiffProcessor } from './diff';
import { CommitMessageLinter } from './lint';
import { CliOptions, LzcConfig } from './types';

/** 提交被 commitlint 拒绝后的最大尝试次数（含首次提交） */
const MAX_COMMIT_ATTEMPTS = 3;

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
  const linter = new CommitMessageLinter();

  // 提交前规范化：修正 scope 大小写等确定性问题，从源头降低被 commitlint 拒绝的概率
  const normalized = linter.normalize(await ai.generateCommitMessage(processed.text));
  const commitMessage = normalized.message;
  if (normalized.changes.length > 0) {
    console.log(chalk.cyan(`🔧 已自动规范化 commit message：${normalized.changes.join('、')}`));
    console.log();
  }

  console.log(chalk.green('生成的 commit message:'));
  console.log(chalk.white('─'.repeat(50)));
  console.log(commitMessage);
  console.log(chalk.white('─'.repeat(50)));
  console.log();

  if (options.dryRun) {
    console.log(chalk.yellow('📋 Dry-run 模式，未执行 commit'));
    return;
  }

  const showManualInstructions = (message: string): void => {
    console.log(chalk.yellow('\n⚠️  提交失败。commit message 如下，可修正后手动执行 git commit：\n'));
    console.log(message);
    console.log();
  };

  /**
   * 提交 message，并在被 commitlint 拒绝时自动分析错误、修正 message 后重试。
   *
   * 流程：提交 → 校验是否成功 → 失败则解析 commitlint 错误 →
   * 应用可自动修复的规则 → 重试；无法自动修复或超过次数时给出人工处理指引。
   */
  const commitWithRetry = async (input: string): Promise<void> => {
    let current = linter.normalize(input).message;

    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
      try {
        await git.commit(current);
        if (attempt > 1) {
          console.log(chalk.green(`✅ 第 ${attempt} 次尝试提交成功`));
        }
        return;
      } catch (error) {
        const output = error instanceof CommitError ? error.output : String(error);
        const problems = linter.analyzeError(output);

        // 非规范类失败（如钩子脚本自身报错）：不重试，直接给出人工处理指引
        if (problems.length === 0) {
          showManualInstructions(current);
          throw error;
        }

        console.log(chalk.red(`\n❌ 第 ${attempt} 次提交被 commitlint 拒绝：`));
        for (const problem of problems) {
          console.log(chalk.yellow(`   • ${problem.message} [${problem.rule}]`));
        }

        const { message: fixed, changes, remaining } = linter.applyFixes(current, problems);
        const hasProgress = fixed !== current;
        if (hasProgress) {
          console.log(chalk.cyan(`🔧 已自动修正：${changes.join('、')}`));
        }

        const canRetry = hasProgress && remaining.length === 0 && attempt < MAX_COMMIT_ATTEMPTS;
        if (!canRetry) {
          if (remaining.length > 0) {
            console.log(chalk.yellow('\n⚠️  以下问题无法自动修复，需手动调整：'));
            for (const problem of remaining) {
              console.log(chalk.yellow(`   • ${problem.message} [${problem.rule}]`));
            }
          }
          showManualInstructions(hasProgress ? fixed : current);
          throw new Error(
            !hasProgress
              ? '提交失败: 无法自动修正 commit message，请手动调整后提交'
              : remaining.length > 0
                ? '提交失败: commit message 不符合规范且无法自动修复'
                : '提交失败: 已达到最大重试次数'
          );
        }

        console.log(chalk.gray(`♻️  已修正 message，重试提交（第 ${attempt + 1} 次）...`));
        current = fixed;
      }
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

      await commitWithRetry(editedMessage.trim());
      return;
    }

    shouldCommit = true;
  }

  if (shouldCommit) {
    await commitWithRetry(commitMessage);
  }
}
