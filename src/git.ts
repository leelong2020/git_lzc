import simpleGit, { SimpleGit } from 'simple-git';

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
    try {
      await this.git.commit(message);
      console.log('✅ 提交成功！');
    } catch (error) {
      throw new Error(`提交失败: ${(error as Error).message}`);
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
