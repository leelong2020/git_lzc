import { DiffProcessor } from '../src/diff';
import { LzcConfig } from '../src/types';

/**
 * 创建 DiffProcessor 实例的辅助函数
 */
function createProcessor(partial: Partial<LzcConfig> = {}): DiffProcessor {
  const config: LzcConfig = {
    model: 'test-model',
    language: 'zh',
    autoCommit: false,
    commitStyle: 'conventional',
    apiProvider: 'anthropic',
    ...partial,
  };
  return new DiffProcessor(config);
}

/** 构造单 hunk 的文件 diff 段 */
function buildFileDiff(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,1 +1,1 @@',
    ...lines
  ].join('\n') + '\n';
}

/** 构造填充行（每行约 60 字符），tag 用于在断言中定位内容 */
function fillerLines(tag: string, count: number): string[] {
  const pad = 'x'.repeat(45);
  return Array.from({ length: count }, (_, i) => `+${tag}_${i}_${pad}`);
}

const STAT = ' src/a.ts | 10 +++++++---\n 1 file changed, 7 insertions(+), 3 deletions(-)';

// ============================================================
// 基础行为
// ============================================================

describe('DiffProcessor - 基础行为', () => {
  it('小 diff 未超预算时原样返回', () => {
    const diff = buildFileDiff('src/a.ts', fillerLines('SMALL', 5));
    const processor = createProcessor();
    const result = processor.process(diff, STAT);

    expect(result.text).toBe(diff);
    expect(result.truncated).toBe(false);
    expect(result.excludedFiles).toEqual([]);
    expect(result.totalFiles).toBe(1);
    expect(result.keptFiles).toBe(1);
  });

  it('maxDiffChars 为 0 时不限制长度', () => {
    const diff = buildFileDiff('src/big.ts', fillerLines('BIG', 250));
    const processor = createProcessor({ maxDiffChars: 0 });
    const result = processor.process(diff, STAT);

    expect(diff.length).toBeGreaterThan(12000);
    expect(result.text).toBe(diff);
    expect(result.truncated).toBe(false);
  });

  it('默认预算按 provider 区分：ollama 6000，其他 12000', () => {
    // 构造约 6600 字符的 diff：超过 ollama 默认预算，未超过云端默认预算
    const diff = buildFileDiff('src/mid.ts', fillerLines('MID', 120));
    expect(diff.length).toBeGreaterThan(6000);
    expect(diff.length).toBeLessThan(12000);

    const ollamaResult = createProcessor({ apiProvider: 'ollama' }).process(diff, STAT);
    expect(ollamaResult.truncated).toBe(true);

    const cloudResult = createProcessor({ apiProvider: 'anthropic' }).process(diff, STAT);
    expect(cloudResult.truncated).toBe(false);
    expect(cloudResult.text).toBe(diff);
  });
});

// ============================================================
// 噪音文件排除
// ============================================================

describe('DiffProcessor - 噪音文件排除', () => {
  it('锁文件内容被排除，但文件名保留在清单中', () => {
    const lockDiff = buildFileDiff('pnpm-lock.yaml', fillerLines('LOCK_CONTENT', 100));
    const codeDiff = buildFileDiff('src/a.ts', ['+REAL_CODE_CHANGE();']);
    const diff = lockDiff + codeDiff;

    const processor = createProcessor({ maxDiffChars: 6000 });
    const result = processor.process(diff, STAT);

    // 锁文件内容不进入输入
    expect(result.text).not.toContain('LOCK_CONTENT');
    // 但文件名出现在排除清单与统计中（保证模型能判断 deps 变更）
    expect(result.text).toContain('pnpm-lock.yaml');
    expect(result.text).toContain(STAT);
    // 真实代码变更完整保留
    expect(result.text).toContain('REAL_CODE_CHANGE');
    expect(result.excludedFiles).toEqual(['pnpm-lock.yaml']);
    expect(result.truncated).toBe(false);
    expect(result.keptFiles).toBe(1);
    expect(result.totalFiles).toBe(2);
  });

  it('默认模式排除 dist/ 与 *.min.js，但不误伤 src 下同名目录', () => {
    const diff =
      buildFileDiff('dist/index.js', fillerLines('DIST', 3)) +
      buildFileDiff('web/app.min.js', fillerLines('MIN', 3)) +
      buildFileDiff('src/dist/helper.ts', fillerLines('SRCDIST', 3)) +
      buildFileDiff('src/main.ts', fillerLines('MAIN', 3));

    const processor = createProcessor();
    const result = processor.process(diff, STAT);

    expect(result.excludedFiles).toEqual(['dist/index.js', 'web/app.min.js']);
    expect(result.text).toContain('SRCDIST');
    expect(result.text).toContain('MAIN');
  });

  it('自定义 excludePatterns 替换默认模式', () => {
    const diff =
      buildFileDiff('debug.log', fillerLines('LOG', 3)) +
      buildFileDiff('pnpm-lock.yaml', fillerLines('LOCK', 3));

    const processor = createProcessor({ diffExcludePatterns: ['*.log'] });
    const result = processor.process(diff, STAT);

    // 自定义模式命中 *.log
    expect(result.excludedFiles).toEqual(['debug.log']);
    // 默认模式被替换后 pnpm-lock.yaml 不再排除
    expect(result.text).toContain('LOCK');
  });

  it('新文件与删除的文件路径提取正确', () => {
    const newFileDiff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/src/new.ts',
      '@@ -0,0 +1,1 @@',
      '+new line'
    ].join('\n') + '\n';
    const deletedFileDiff = [
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/src/old.ts',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      '-old line'
    ].join('\n') + '\n';

    const processor = createProcessor({ diffExcludePatterns: ['new.ts', 'old.ts'] });
    const result = processor.process(newFileDiff + deletedFileDiff, STAT);

    expect(result.excludedFiles).toEqual(['src/new.ts', 'src/old.ts']);
  });
});

// ============================================================
// 预算截断
// ============================================================

describe('DiffProcessor - 预算截断', () => {
  it('多个大文件超预算时按文件粒度截断且总量不超预算', () => {
    // 每个文件约 3900 字符，总计约 7800，预算 6000
    const diff =
      buildFileDiff('src/a.ts', fillerLines('FILE_A', 60)) +
      buildFileDiff('src/b.ts', fillerLines('FILE_B', 60));

    const processor = createProcessor({ maxDiffChars: 6000 });
    const result = processor.process(diff, STAT);

    expect(result.truncated).toBe(true);
    expect(result.keptFiles).toBe(0);
    expect(result.text.length).toBeLessThanOrEqual(6000);
    // 两个文件都有代表内容（文件头保留）
    expect(result.text).toContain('diff --git a/src/a.ts');
    expect(result.text).toContain('diff --git a/src/b.ts');
    // 两个文件都被标注省略
    expect(result.text.match(/此文件其余内容已省略/g)).toHaveLength(2);
    // 包含变更统计
    expect(result.text).toContain(STAT);
  });

  it('小文件完整保留，大文件独占剩余预算', () => {
    const smallTail = '+SMALL_FILE_TAIL';
    const diff =
      buildFileDiff('src/small.ts', fillerLines('SMALL', 3).concat(smallTail)) +
      buildFileDiff('src/big.ts', fillerLines('BIG', 100));

    const processor = createProcessor({ maxDiffChars: 1500 });
    const result = processor.process(diff, STAT);

    expect(result.truncated).toBe(true);
    expect(result.keptFiles).toBe(1);
    expect(result.text.length).toBeLessThanOrEqual(1500);
    // 小文件完整保留到最后一行
    expect(result.text).toContain('SMALL_FILE_TAIL');
  });

  it('截断优先在 hunk 边界处切断', () => {
    // 3 个 hunk，每个约 370 字符
    const hunk = (tag: string) => [
      `@@ -1,6 +1,6 @@`,
      ...fillerLines(tag, 6)
    ];
    const fileContent = [
      'diff --git a/src/hunk.ts b/src/hunk.ts',
      'index 1111111..2222222 100644',
      '--- a/src/hunk.ts',
      '+++ b/src/hunk.ts',
      ...hunk('HUNK_ONE'),
      ...hunk('HUNK_TWO'),
      ...hunk('HUNK_THREE')
    ].join('\n') + '\n';

    const processor = createProcessor({ maxDiffChars: 700 });
    const result = processor.process(fileContent, STAT);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(700);
    // 第一个 hunk 完整保留，第二个 hunk 整体被切掉（而不是切一半）
    expect(result.text).toContain('HUNK_ONE_5');
    expect(result.text).not.toContain('HUNK_TWO_0');
    expect(result.text).toContain('此文件其余内容已省略');
  });

  it('单个超大 hunk 退化为按行切断，输出仍是原内容的完整前缀', () => {
    const diff = buildFileDiff('src/huge.ts', fillerLines('HUGE', 50));

    const processor = createProcessor({ maxDiffChars: 800 });
    const result = processor.process(diff, STAT);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(800);
    // 截断点之前的内容必须是原始 diff 的完整前缀（无半截行）
    const beforeMarker = result.text.split('... (此文件其余内容已省略)')[0].trimEnd();
    // 去掉头部包装文案后，文件内容部分应是原 diff 的前缀
    const contentStart = beforeMarker.indexOf('diff --git');
    expect(diff.startsWith(beforeMarker.slice(contentStart) + '\n') ||
           diff.startsWith(beforeMarker.slice(contentStart))).toBe(true);
  });

  it('预算极小时每个文件至少保留文件头与省略标记', () => {
    const diff =
      buildFileDiff('src/a.ts', fillerLines('A', 100)) +
      buildFileDiff('src/b.ts', fillerLines('B', 100));

    const processor = createProcessor({ maxDiffChars: 600 });
    const result = processor.process(diff, STAT);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('diff --git a/src/a.ts');
    expect(result.text).toContain('diff --git a/src/b.ts');
  });
});

// ============================================================
// 包装文案
// ============================================================

describe('DiffProcessor - 包装文案', () => {
  const excludedDiff =
    buildFileDiff('pnpm-lock.yaml', fillerLines('LOCK', 3)) +
    buildFileDiff('src/a.ts', fillerLines('CODE', 3));

  it('中文包装文案', () => {
    const result = createProcessor({ language: 'zh' }).process(excludedDiff, STAT);
    expect(result.text).toContain('变更统计：');
    expect(result.text).toContain('以下文件内容已省略');
    expect(result.text).toContain('主要变更内容：');
  });

  it('英文包装文案', () => {
    const result = createProcessor({ language: 'en' }).process(excludedDiff, STAT);
    expect(result.text).toContain('Change statistics:');
    expect(result.text).toContain('Content omitted for these files');
    expect(result.text).toContain('Main changes:');
  });

  it('排除文件超过 10 个时只列出前 10 个', () => {
    const diff = Array.from({ length: 15 }, (_, i) =>
      buildFileDiff(`pkg-${i}/package-lock.json`, fillerLines(`LOCK${i}`, 2))
    ).join('');

    const result = createProcessor().process(diff, STAT);

    expect(result.excludedFiles).toHaveLength(15);
    expect(result.text).toContain('共 15 个');
    expect(result.text).toContain('pkg-9/package-lock.json');
    expect(result.text).not.toContain('pkg-10/package-lock.json');
  });
});
