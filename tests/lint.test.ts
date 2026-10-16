import { CommitMessageLinter } from '../src/lint';

const linter = new CommitMessageLinter();

describe('CommitMessageLinter - normalize', () => {
  it('将大写 scope 转为小写（复现 issue 场景）', () => {
    const result = linter.normalize(
      'feat(devMgr/admin.py): 重构设备管理后台字段分组逻辑'
    );
    expect(result.message).toBe('feat(devmgr/admin.py): 重构设备管理后台字段分组逻辑');
    expect(result.changes).toContain('scope 转为小写');
  });

  it('将大写 type 转为小写', () => {
    const result = linter.normalize('Feat(core): 新增功能');
    expect(result.message).toBe('feat(core): 新增功能');
    expect(result.changes).toContain('type 转为小写');
  });

  it('去除 subject 结尾句号', () => {
    const result = linter.normalize('fix(api): 修复接口超时.');
    expect(result.message).toBe('fix(api): 修复接口超时');
    expect(result.changes).toContain('去除 subject 结尾句号');
  });

  it('规范化幂等：已规范的 message 不再产生变更', () => {
    const message = 'feat(core): 新增功能\n\n补充说明';
    const result = linter.normalize(message);
    expect(result.message).toBe(message);
    expect(result.changes).toEqual([]);
  });

  it('free 风格 message（无 conventional 前缀）仅做基础清理', () => {
    const result = linter.normalize('  更新一些内容  ');
    expect(result.message).toBe('更新一些内容');
  });

  it('保留 scope 缺失与破坏性变更标记', () => {
    const result = linter.normalize('Feat!: 破坏性变更');
    expect(result.message).toBe('feat!: 破坏性变更');
  });
});

describe('CommitMessageLinter - lint', () => {
  it('标记大写 scope 为 scope-case 且可修复', () => {
    const problems = linter.lint('feat(devMgr/admin.py): 重构');
    const scopeCase = problems.find(p => p.rule === 'scope-case');
    expect(scopeCase).toBeDefined();
    expect(scopeCase!.fixable).toBe(true);
  });

  it('合规 message 无问题', () => {
    expect(linter.lint('feat(core): 新增功能')).toEqual([]);
  });

  it('未知 type 标记为 type-enum 且不可修复', () => {
    const problems = linter.lint('update(core): 一些改动');
    const typeEnum = problems.find(p => p.rule === 'type-enum');
    expect(typeEnum).toBeDefined();
    expect(typeEnum!.fixable).toBe(false);
  });

  it('超长 body 行标记为 body-max-line-length', () => {
    const problems = linter.lint(`feat(core): 新增功能\n\n${'x'.repeat(120)}`);
    expect(problems.some(p => p.rule === 'body-max-line-length')).toBe(true);
  });
});

describe('CommitMessageLinter - analyzeError', () => {
  it('解析 commitlint 的 scope-case 错误', () => {
    const output = [
      '/home/fsz/.npm-global/bin/npx',
      '⧗   input: feat(devMgr/admin.py): 重构设备管理后台字段分组逻辑',
      '✖   scope must be lower-case [scope-case]',
      '',
      '✖   found 1 problems, 0 warnings',
      'ⓘ   Get help: https://github.com/conventional-changelog/commitlint/#what-is-commitlint'
    ].join('\n');

    const problems = linter.analyzeError(output);
    expect(problems).toEqual([
      { rule: 'scope-case', message: 'scope must be lower-case', fixable: true }
    ]);
  });

  it('解析多条规则并去重', () => {
    const output = [
      '✖   scope must be lower-case [scope-case]',
      '✖   subject may not be empty [subject-empty]',
      '✖   found 2 problems, 0 warnings'
    ].join('\n');

    const problems = linter.analyzeError(output);
    expect(problems.map(p => p.rule)).toEqual(['scope-case', 'subject-empty']);
    expect(problems.find(p => p.rule === 'subject-empty')!.fixable).toBe(false);
  });

  it('非 commitlint 输出返回空数组', () => {
    expect(linter.analyzeError('fatal: unable to write new index file')).toEqual([]);
  });
});

describe('CommitMessageLinter - applyFixes', () => {
  it('修复 scope-case 后 remaining 为空', () => {
    const message = 'feat(devMgr/admin.py): 重构设备管理后台字段分组逻辑';
    const problems = linter.analyzeError('✖   scope must be lower-case [scope-case]');
    const result = linter.applyFixes(message, problems);
    expect(result.message).toBe('feat(devmgr/admin.py): 重构设备管理后台字段分组逻辑');
    expect(result.changes).toContain('scope 转为小写');
    expect(result.remaining).toEqual([]);
  });

  it('修复超长 body 行', () => {
    const message = `feat(core): 新增功能\n\n${'x'.repeat(120)}`;
    const problems = linter.analyzeError('✖   body lines must not be longer than 100 characters [body-max-line-length]');
    const result = linter.applyFixes(message, problems);
    const bodyLines = result.message.split('\n').slice(1).filter(Boolean);
    for (const line of bodyLines) {
      expect(line.length).toBeLessThanOrEqual(72);
    }
  });

  it('不可修复的问题保留在 remaining 中', () => {
    const longHeader = `feat(core): ${'长'.repeat(120)}`;
    const problems = linter.analyzeError('✖   header must not be longer than 100 characters [header-max-length]');
    const result = linter.applyFixes(longHeader, problems);
    expect(result.message).toBe(longHeader);
    expect(result.remaining.some(p => p.rule === 'header-max-length')).toBe(true);
  });
});
