import { LzcConfig } from './types';

/** 单个文件的 diff 段 */
interface FileDiff {
  path: string;
  content: string; // 含 diff --git 文件头的完整段落
}

export interface ProcessedDiff {
  /** 处理后的输入文本 */
  text: string;
  /** 是否有文件内容被截断 */
  truncated: boolean;
  /** 被噪音规则排除的文件（内容未包含，但文件名保留在清单中） */
  excludedFiles: string[];
  /** 完整保留内容的文件数 */
  keptFiles: number;
  /** diff 中的文件总数 */
  totalFiles: number;
}

/** 默认噪音文件排除模式：锁文件、压缩产物、构建产物、快照等 */
export const DEFAULT_DIFF_EXCLUDE_PATTERNS: string[] = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'go.sum',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.snap',
  'dist/**',
  'build/**',
  '__snapshots__/**'
];

// 默认 diff 字符预算：云端大模型上下文充足，本地小模型需要更紧的预算
const DEFAULT_MAX_DIFF_CHARS = 12000;
const OLLAMA_MAX_DIFF_CHARS = 6000;
// 触发 stat 二次裁剪的最低内容预算
const MIN_CONTENT_BUDGET = 500;
// stat 最多保留的行数（防止海量文件场景下 stat 本身挤占预算）
const MAX_STAT_LINES = 100;

/**
 * diff 预处理器：将原始 diff 转换为适合发送给模型的输入。
 *
 * 处理策略：
 * 1. 按文件拆分，过滤噪音文件（内容不进输入，但文件名保留在清单中）
 * 2. 总大小未超预算时原样返回
 * 3. 超预算时按文件粒度公平分配预算，优先在 hunk 边界截断，
 *    并始终附带完整变更统计，保证模型了解每个文件的变更概况
 */
export class DiffProcessor {
  private readonly maxChars: number;
  private readonly excludePatterns: string[];
  private readonly isChinese: boolean;

  constructor(config: LzcConfig) {
    this.maxChars = config.maxDiffChars
      ?? (config.apiProvider === 'ollama' ? OLLAMA_MAX_DIFF_CHARS : DEFAULT_MAX_DIFF_CHARS);
    this.excludePatterns = config.diffExcludePatterns?.length
      ? config.diffExcludePatterns
      : DEFAULT_DIFF_EXCLUDE_PATTERNS;
    this.isChinese = config.language !== 'en';
  }

  /**
   * 处理原始 diff。
   * @param diff git diff --staged 的完整输出
   * @param stat git diff --staged --stat 的输出
   */
  process(diff: string, stat: string): ProcessedDiff {
    const files = this.splitByFile(diff);
    const excluded: FileDiff[] = [];
    const normal: FileDiff[] = [];
    for (const file of files) {
      (this.matchesExclude(file.path) ? excluded : normal).push(file);
    }
    const excludedFiles = excluded.map(f => f.path);

    const unlimited = this.maxChars <= 0;
    // 无排除文件且未超预算：原样返回，保持原有行为
    if (excluded.length === 0 && (unlimited || diff.length <= this.maxChars)) {
      return {
        text: diff,
        truncated: false,
        excludedFiles: [],
        keptFiles: normal.length,
        totalFiles: files.length
      };
    }

    let header = this.buildHeader(stat, excludedFiles, normal.length > 0);
    let contentBudget = unlimited ? Infinity : this.maxChars - header.length;

    // 极端情况：stat 本身过长（海量文件），裁剪 stat 释放预算
    if (!unlimited && contentBudget < MIN_CONTENT_BUDGET) {
      header = this.buildHeader(this.trimStat(stat), excludedFiles, normal.length > 0);
      contentBudget = Math.max(0, this.maxChars - header.length);
    }

    const budgets = this.allocateBudget(normal, contentBudget);

    let keptFiles = 0;
    let truncated = false;
    const parts = normal.map(file => {
      const budget = budgets.get(file)!;
      if (file.content.length <= budget) {
        keptFiles++;
        return file.content;
      }
      truncated = true;
      return this.truncateFileContent(file.content, budget);
    });

    const text = parts.length > 0 ? header + parts.join('\n') : header.trimEnd();
    return { text, truncated, excludedFiles, keptFiles, totalFiles: files.length };
  }

  /** 按 diff --git 边界将 diff 拆分为单文件段 */
  private splitByFile(diff: string): FileDiff[] {
    return diff
      .split(/(?=^diff --git )/gm)
      .filter(part => part.trim() !== '')
      .map(part => ({ path: this.extractPath(part), content: part.trimEnd() }));
  }

  /**
   * 提取文件路径。优先使用 +++ b/ 行（删除的文件回退到 --- a/ 行），
   * 避免 diff --git 行在文件名包含 " b/" 时解析出错。
   */
  private extractPath(content: string): string {
    const candidates = [
      content.match(/^\+\+\+ (.+)$/m)?.[1],
      content.match(/^--- (.+)$/m)?.[1],
      content.match(/^diff --git a\/(.+?) b\/.+$/m)?.[1]
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      let path = raw.trim();
      if (path === '/dev/null') continue;
      // git 对含特殊字符的路径会加引号，去掉首尾引号与 a/ b/ 前缀
      if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
      if (path.startsWith('a/') || path.startsWith('b/')) path = path.slice(2);
      return path;
    }
    return 'unknown';
  }

  /** 判断文件是否命中排除模式 */
  private matchesExclude(path: string): boolean {
    const basename = path.split('/').pop() || path;
    return this.excludePatterns.some(pattern => {
      // 模式含 / 时匹配完整路径，否则只匹配文件名
      const target = pattern.includes('/') ? path : basename;
      return this.globToRegExp(pattern).test(target);
    });
  }

  /** 简易 glob 转正则：* 不跨目录，** 跨目录，? 匹配单个非 / 字符 */
  private globToRegExp(glob: string): RegExp {
    const source = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\0/g, '.*');
    return new RegExp(`^${source}$`);
  }

  /** 组装头部：变更统计 + 排除清单 + 内容引导语 */
  private buildHeader(stat: string, excludedFiles: string[], hasContent: boolean): string {
    const lines: string[] = this.isChinese
      ? ['变更统计：', stat]
      : ['Change statistics:', stat];

    if (excludedFiles.length > 0) {
      lines.push('', this.formatExcludedFiles(excludedFiles));
    }
    if (hasContent) {
      lines.push('', this.isChinese ? '主要变更内容：' : 'Main changes:');
    }
    return lines.join('\n') + '\n';
  }

  /** 格式化排除文件清单（超过 10 个只列前 10 个） */
  private formatExcludedFiles(files: string[]): string {
    const shown = files.slice(0, 10).join(', ') + (files.length > 10 ? ' …' : '');
    return this.isChinese
      ? `以下文件内容已省略（锁文件/构建产物等）：${shown}（共 ${files.length} 个）`
      : `Content omitted for these files (lock files/build artifacts): ${shown} (${files.length} total)`;
  }

  /** stat 行数过多时保留前 MAX_STAT_LINES 行 + 末尾汇总行 */
  private trimStat(stat: string): string {
    const lines = stat.split('\n');
    if (lines.length <= MAX_STAT_LINES) return stat;
    const summary = lines[lines.length - 1];
    const omitted = lines.length - MAX_STAT_LINES - 1;
    const note = this.isChinese
      ? `... (其余 ${omitted} 个文件统计已省略)`
      : `... (${omitted} more files omitted)`;
    return [...lines.slice(0, MAX_STAT_LINES), note, summary].join('\n');
  }

  /**
   * 水位线分配：小文件全量保留，剩余预算平分给大文件。
   * 每轮把能完整放下的文件移出分配池，直到剩余文件都装不下为止。
   */
  private allocateBudget(files: FileDiff[], total: number): Map<FileDiff, number> {
    const budgets = new Map<FileDiff, number>();
    let remaining = total;
    let pool = [...files];

    while (pool.length > 0) {
      const share = Math.floor(remaining / pool.length);
      const fitting = pool.filter(f => f.content.length <= share);
      if (fitting.length === 0) {
        for (const f of pool) budgets.set(f, Math.max(share, 0));
        break;
      }
      for (const f of fitting) {
        budgets.set(f, f.content.length);
        remaining -= f.content.length;
      }
      pool = pool.filter(f => !fitting.includes(f));
    }
    return budgets;
  }

  /**
   * 在预算内截断单文件 diff：保留文件头，优先在 hunk 边界切断，
   * 避免产生半个 hunk 的畸形内容。
   */
  private truncateFileContent(content: string, budget: number): string {
    const marker = this.isChinese
      ? '\n... (此文件其余内容已省略)'
      : '\n... (rest of this file omitted)';

    // 文件头：到第一个 hunk 之前的行（diff --git / index / --- / +++）
    const firstHunk = content.search(/^@@ /m);
    const header = firstHunk === -1
      ? content.split('\n').slice(0, 5).join('\n')
      : content.slice(0, firstHunk).trimEnd();

    const bodyBudget = budget - marker.length;
    // 预算放不下文件头以外的内容：只保留文件头 + 标记
    if (bodyBudget <= header.length + 1) {
      return header + marker;
    }

    const sliceEnd = Math.min(bodyBudget, content.length);
    const slice = content.slice(0, sliceEnd);
    const lastHunk = slice.lastIndexOf('\n@@ ');
    // hunk 边界能利用一半以上预算时在边界处切断，否则退化为按行切断
    const cut = lastHunk > header.length && lastHunk > sliceEnd * 0.5
      ? lastHunk
      : slice.lastIndexOf('\n');
    return content.slice(0, Math.max(cut, header.length)) + marker;
  }
}
