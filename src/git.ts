import simpleGit, { SimpleGit } from 'simple-git';

/**
 * 提交失败错误：携带 git/钩子（如 commitlint）的原始输出，
 * 供上层分析失败原因后自动修正并重试。
 */
export class CommitError extends Error {
  /** 原始输出（stdout + stderr 合并） */
  readonly output: string;

  constructor(message: string, output: string) {
    super(message);
    this.name = 'CommitError';
    this.output = output;
  }
}

export class GitHelper {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async getStagedDiff(): Promise<string> {
    try {
      const status = await this.git.status();

      if (status.staged.length === 0) {
        throw new Error('没有暂存的文件。请先执行 git add .');
      }

      const diff = await this.git.diff(['--staged']);

      if (!diff || diff.trim() === '') {
        throw new Error('暂存区没有可显示的变更');
      }

      return diff;
    } catch (error) {
      if ((error as Error).message.includes('没有暂存的文件')) {
        throw error;
      }
      throw new Error(`获取 Git diff 失败: ${(error as Error).message}`);
    }
  }

  async commit(message: string): Promise<void> {
    const before = await this.getHeadHash();

    try {
      await this.git.commit(message);
    } catch (error) {
      const output = this.extractOutput(error);
      throw new CommitError(`提交失败: ${output}`, output);
    }

    // 提交后校验：HEAD 必须产生新的提交，
    // 防止提交被钩子/包装脚本静默拦截却未报错的情况
    const after = await this.getHeadHash();
    if (after === before) {
      const output = '提交命令执行后 HEAD 未发生变化，提交可能被钩子拦截或未生效';
      throw new CommitError(output, output);
    }

    console.log('✅ 提交成功！');
  }

  /** 提取错误输出，供上层分析失败原因 */
  private extractOutput(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message.trim();
    }
    return String(error).trim();
  }

  /** 读取当前 HEAD，仓库尚无提交时返回 null（初始提交场景） */
  private async getHeadHash(): Promise<string | null> {
    try {
      const hash = await this.git.revparse(['HEAD']);
      return hash.trim();
    } catch {
      return null;
    }
  }

  async getStagedDiffStat(): Promise<string> {
    try {
      const stat = await this.git.diff(['--staged', '--stat']);
      return stat.trim() || '无统计信息';
    } catch (error) {
      return '获取变更统计失败';
    }
  }

  async getRepoRoot(): Promise<string> {
    try {
      const result = await this.git.revparse(['--show-toplevel']);
      return result.trim();
    } catch (error) {
      throw new Error('当前目录不是 Git 仓库');
    }
  }
}
