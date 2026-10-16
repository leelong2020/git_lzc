import { wrapBodyLines } from './text';

/**
 * @commitlint/config-conventional 允许的 type 集合。
 * 注意：这里使用 commitlint 的完整集合（比生成 prompt 中列出的更宽），
 * 避免把 commitlint 本身接受的 type 误判为不合规。
 */
export const CONVENTIONAL_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test'
] as const;

/** config-conventional 默认 header 长度上限 */
const HEADER_MAX_LENGTH = 100;
/** config-conventional 默认 body/footer 单行长度上限 */
const BODY_MAX_LINE_LENGTH = 100;

/** <type>(<scope>)?(!)?: <subject> */
const HEADER_PATTERN = /^([A-Za-z]+)(?:\(([^()]*)\))?(!)?:\s*(.*)$/;
/** 去除 ANSI 颜色转义，兼容带颜色的 commitlint 输出 */
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
/** commitlint 错误行：✖  scope must be lower-case [scope-case] */
const COMMITLINT_PROBLEM_PATTERN = /[✖✗×]\s+(.+?)\s+\[([a-z0-9-]+)\]/g;

/** 可由 applyFixes 自动修复的规则 */
const FIXABLE_RULES = new Set<string>([
  'type-case',
  'scope-case',
  'subject-full-stop',
  'header-trim',
  'body-max-line-length',
  'footer-max-line-length'
]);

export interface LintProblem {
  /** commitlint 规则名，如 scope-case */
  rule: string;
  /** 规则错误描述 */
  message: string;
  /** 是否可由 applyFixes 自动修复 */
  fixable: boolean;
}

export interface NormalizeResult {
  /** 规范化后的 message */
  message: string;
  /** 已应用的规范化说明，空数组表示无需改动 */
  changes: string[];
}

export interface FixResult {
  /** 修复后的 message */
  message: string;
  /** 已自动应用的修复说明 */
  changes: string[];
  /** 修复后仍存在的规范问题 */
  remaining: LintProblem[];
}

interface ParsedHeader {
  type: string;
  scope?: string;
  /** 破坏性变更标记 `!`，无则为空字符串 */
  breaking: string;
  subject: string;
}

/**
 * commit message 规范处理：本地预检 + 错误分析 + 自动修复。
 *
 * 目标：提交被 commitlint 拒绝时，无需人工介入即可完成
 * 「分析错误 → 修正 message → 重试提交」。规则对齐
 * @commitlint/config-conventional 默认值。
 */
export class CommitMessageLinter {
  /**
   * 规范化 message：修正大小写、结尾句号、多余空白等确定性问题。
   * 幂等，可安全地重复调用。
   */
  normalize(message: string): NormalizeResult {
    const changes: string[] = [];
    const addChange = (change: string): void => {
      if (!changes.includes(change)) changes.push(change);
    };

    const original = message;
    let text = message.trim();
    if (text !== original) addChange('去除首尾空白');

    const lines = text.split('\n');
    const parsed = this.parseHeader(lines[0] ?? '');

    if (parsed) {
      const type = parsed.type.toLowerCase();
      if (type !== parsed.type) addChange('type 转为小写');

      let scope = parsed.scope;
      if (scope !== undefined) {
        const trimmed = scope.trim();
        if (trimmed !== scope) addChange('去除 scope 首尾空格');
        const lower = trimmed.toLowerCase();
        if (lower !== trimmed) addChange('scope 转为小写');
        scope = lower;
      }

      let subject = parsed.subject.trim();
      const stripped = subject.replace(/\.+$/, '');
      if (stripped !== subject) {
        addChange('去除 subject 结尾句号');
        subject = stripped;
      }

      const scopePart = scope === undefined ? '' : `(${scope})`;
      lines[0] = `${type}${scopePart}${parsed.breaking}: ${subject}`;
    }

    text = lines.join('\n');
    const collapsed = text.replace(/\n{3,}/g, '\n\n');
    if (collapsed !== text) {
      addChange('压缩连续空行');
      text = collapsed;
    }

    return { message: text, changes };
  }

  /** 本地预检：返回不符合 Conventional Commits 的问题列表 */
  lint(message: string): LintProblem[] {
    const problems: LintProblem[] = [];
    const lines = message.split('\n');
    const header = lines[0] ?? '';

    if (header !== header.trim()) {
      problems.push({ rule: 'header-trim', message: 'header 首尾不能有空白', fixable: true });
    }

    const parsed = this.parseHeader(header);
    if (!parsed) {
      problems.push({
        rule: 'header-format',
        message: 'header 需符合 <type>(<scope>): <subject> 格式',
        fixable: false
      });
    } else {
      if (parsed.type !== parsed.type.toLowerCase()) {
        problems.push({ rule: 'type-case', message: 'type 必须小写', fixable: true });
      }
      if (!(CONVENTIONAL_TYPES as readonly string[]).includes(parsed.type.toLowerCase())) {
        problems.push({
          rule: 'type-enum',
          message: `type 必须是 ${CONVENTIONAL_TYPES.join('/')} 之一`,
          fixable: false
        });
      }
      if (parsed.scope !== undefined && parsed.scope !== parsed.scope.toLowerCase()) {
        problems.push({ rule: 'scope-case', message: 'scope 必须小写', fixable: true });
      }
      if (parsed.subject.trim() === '') {
        problems.push({ rule: 'subject-empty', message: 'subject 不能为空', fixable: false });
      }
      if (/\.$/.test(parsed.subject)) {
        problems.push({ rule: 'subject-full-stop', message: 'subject 结尾不能有句号', fixable: true });
      }
    }

    if (header.length > HEADER_MAX_LENGTH) {
      problems.push({
        rule: 'header-max-length',
        message: `header 不能超过 ${HEADER_MAX_LENGTH} 个字符`,
        fixable: false
      });
    }

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].length > BODY_MAX_LINE_LENGTH) {
        problems.push({
          rule: 'body-max-line-length',
          message: `body 第 ${i + 1} 行超过 ${BODY_MAX_LINE_LENGTH} 个字符`,
          fixable: true
        });
        break;
      }
    }

    return problems;
  }

  /**
   * 从提交失败的输出（如 commitlint 的诊断信息）中解析出规范问题。
   * 无法识别为 commitlint 问题时返回空数组，调用方据此判断无需重试。
   */
  analyzeError(output: string): LintProblem[] {
    const clean = output.replace(ANSI_PATTERN, '');
    const problems: LintProblem[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    COMMITLINT_PROBLEM_PATTERN.lastIndex = 0;
    while ((match = COMMITLINT_PROBLEM_PATTERN.exec(clean)) !== null) {
      const message = match[1].trim();
      const rule = match[2];
      if (seen.has(rule)) continue;
      seen.add(rule);
      problems.push({ rule, message, fixable: FIXABLE_RULES.has(rule) });
    }

    return problems;
  }

  /**
   * 依据问题列表自动修复 message：先做通用规范化，
   * 再针对超长 body 折行；返回修复后仍存在的问题。
   */
  applyFixes(message: string, problems: LintProblem[]): FixResult {
    const changes: string[] = [];
    let current = message;

    const normalized = this.normalize(current);
    if (normalized.message !== current) {
      changes.push(...normalized.changes);
      current = normalized.message;
    }

    const rules = new Set(problems.map(p => p.rule));
    if (rules.has('body-max-line-length') || rules.has('footer-max-line-length')) {
      const wrapped = wrapBodyLines(current);
      if (wrapped !== current) {
        if (!changes.includes('折行超长 body')) changes.push('折行超长 body');
        current = wrapped;
      }
    }

    return { message: current, changes, remaining: this.lint(current) };
  }

  private parseHeader(header: string): ParsedHeader | null {
    const match = HEADER_PATTERN.exec(header);
    if (!match) return null;
    return {
      type: match[1],
      scope: match[2],
      breaking: match[3] ?? '',
      subject: match[4]
    };
  }
}
