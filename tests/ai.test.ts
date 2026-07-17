import { AIClient } from '../src/ai';
import { LzcConfig } from '../src/types';

/**
 * 创建 AIClient 实例的辅助函数
 */
function createClient(partial: Partial<LzcConfig> = {}): AIClient {
  const config: LzcConfig = {
    model: 'claude-test',
    language: 'zh',
    autoCommit: false,
    commitStyle: 'conventional',
    apiProvider: 'anthropic',
    ...partial,
  };
  return new AIClient(config);
}

// ============================================================
// 方向一：代码审计（验证逻辑正确性）
// ============================================================

describe('AIClient - 代码审计', () => {
  describe('buildPrompt 结构正确性', () => {
    const diff = 'mock diff content';

    it('conventional + zh 返回包含 systemPrompt 和 userPrompt 的对象', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      // buildPrompt 为 private 方法，通过类型断言调用以进行单元测试
      const result = (client as any).buildPrompt(diff);
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(result.systemPrompt).toContain('Conventional Commits');
    });

    it('conventional + en 返回英文 systemPrompt', () => {
      const client = createClient({ language: 'en', commitStyle: 'conventional' });
      const result = (client as any).buildPrompt(diff);
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(result.systemPrompt).toContain('Conventional Commits');
      expect(result.systemPrompt).toContain('Rules:');
    });

    it('free + zh 不含 conventional 格式说明', () => {
      const client = createClient({ language: 'zh', commitStyle: 'free' });
      const result = (client as any).buildPrompt(diff);
      expect(result.systemPrompt).not.toContain('Conventional Commits');
      expect(result.systemPrompt).not.toContain('<type>');
      expect(result).toHaveProperty('userPrompt');
    });

    it('free + en 不含 conventional 格式说明', () => {
      const client = createClient({ language: 'en', commitStyle: 'free' });
      const result = (client as any).buildPrompt(diff);
      expect(result.systemPrompt).not.toContain('Conventional Commits');
      expect(result.systemPrompt).not.toContain('<type>');
      expect(result).toHaveProperty('userPrompt');
    });

    it('userPrompt 包含传入的 diff 内容', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const result = (client as any).buildPrompt(diff);
      expect(result.userPrompt).toContain(diff);
    });
  });

  describe('sanitizeCommitMessage 基础功能', () => {
    it('正常输入返回原内容', () => {
      const client = createClient();
      const result = (client as any).sanitizeCommitMessage('feat: test');
      expect(result).toBe('feat: test');
    });

    it('空字符串返回空字符串', () => {
      const client = createClient();
      const result = (client as any).sanitizeCommitMessage('');
      expect(result).toBe('');
    });

    it('仅空白字符返回空字符串', () => {
      const client = createClient();
      const result = (client as any).sanitizeCommitMessage('   \n\t  ');
      expect(result).toBe('');
    });
  });

  describe('generateCommitMessage 错误处理', () => {
    it('缺少 API key（非 ollama）抛出包含"未设置 API Key"的错误', async () => {
      const client = createClient({ apiProvider: 'anthropic', apiKey: undefined });
      await expect(client.generateCommitMessage('diff')).rejects.toThrow('未设置 API Key');
    });

    it('不支持的 provider 抛出包含"不支持的 API 提供商"的错误', async () => {
      const client = createClient({ apiProvider: 'unsupported' as any, apiKey: 'test-key' });
      await expect(client.generateCommitMessage('diff')).rejects.toThrow('不支持的 API 提供商');
    });
  });
});

// ============================================================
// 方向二：输出质量评价（验证内容质量）
// ============================================================

describe('AIClient - 输出质量评价', () => {
  describe('buildPrompt 输出质量', () => {
    it('conventional + zh 包含全部 type 说明', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const { systemPrompt } = (client as any).buildPrompt('diff');
      expect(systemPrompt).toContain('feat:');
      expect(systemPrompt).toContain('fix:');
      expect(systemPrompt).toContain('docs:');
      expect(systemPrompt).toContain('style:');
      expect(systemPrompt).toContain('refactor:');
      expect(systemPrompt).toContain('perf:');
      expect(systemPrompt).toContain('test:');
      expect(systemPrompt).toContain('chore:');
    });

    it('conventional + zh 包含 scope 指南', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const { systemPrompt } = (client as any).buildPrompt('diff');
      expect(systemPrompt).toContain('从文件路径推断');
    });

    it('conventional + zh 包含至少 3 个 few-shot 示例', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const { systemPrompt } = (client as any).buildPrompt('diff');
      // 匹配 conventional commit 格式示例行，如 "feat(config): xxx"
      const matches = systemPrompt.match(/^(feat|fix|docs|style|refactor|perf|test|chore)\([^)]*\):/gm);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(3);
    });

    it('conventional + zh subject 包含长度和语气标准', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const { systemPrompt } = (client as any).buildPrompt('diff');
      expect(systemPrompt).toContain('不超过 30 个字');
      expect(systemPrompt).toContain('祈使语气');
    });

    it('conventional + en subject 包含英文格式标准', () => {
      const client = createClient({ language: 'en', commitStyle: 'conventional' });
      const { systemPrompt } = (client as any).buildPrompt('diff');
      expect(systemPrompt).toContain('Max 50 characters');
      expect(systemPrompt).toContain('Lowercase first letter');
    });

    it('conventional + zh userPrompt 包含省略 body 约束', () => {
      const client = createClient({ language: 'zh', commitStyle: 'conventional' });
      const { userPrompt } = (client as any).buildPrompt('diff');
      expect(userPrompt).toContain('省略 body');
    });
  });

  describe('sanitizeCommitMessage 清洗质量 - 单场景', () => {
    const client = createClient();

    it('去除 markdown 代码块', () => {
      const result = (client as any).sanitizeCommitMessage('```\nfeat: test\n```');
      expect(result).toBe('feat: test');
    });

    it('去除 diff 前缀 + 空格', () => {
      const result = (client as any).sanitizeCommitMessage('+ added line');
      expect(result).toBe('added line');
    });

    it('去除 diff 前缀 无空格', () => {
      const result = (client as any).sanitizeCommitMessage('+added line');
      expect(result).toBe('added line');
    });

    it('去除 AI 前缀 Commit message:', () => {
      const result = (client as any).sanitizeCommitMessage('Commit message: feat: test');
      expect(result).toBe('feat: test');
    });

    it('去除 AI 前缀 Generated commit:', () => {
      const result = (client as any).sanitizeCommitMessage('Generated commit: feat: test');
      expect(result).toBe('feat: test');
    });

    it("去除 AI 前缀 Here's the commit message:", () => {
      const result = (client as any).sanitizeCommitMessage("Here's the commit message: feat: test");
      expect(result).toBe('feat: test');
    });

    it('去除 AI 前缀 中文', () => {
      const result = (client as any).sanitizeCommitMessage('以下是 commit message: feat: test');
      expect(result).toBe('feat: test');
    });

    it('去除重复前缀 "feat: feat: xxx"', () => {
      const result = (client as any).sanitizeCommitMessage('feat: feat: test');
      expect(result).toBe('feat: test');
    });

    it('去除重复前缀含 scope "feat: feat(config): xxx"', () => {
      const result = (client as any).sanitizeCommitMessage('feat: feat(config): test');
      expect(result).toBe('feat(config): test');
    });

    it('冒号后双空格规范化为单空格', () => {
      const result = (client as any).sanitizeCommitMessage('feat:  test');
      expect(result).toBe('feat: test');
    });

    it('连续空行压缩为最多两个', () => {
      const result = (client as any).sanitizeCommitMessage('a\n\n\n\nb');
      expect(result).toBe('a\n\nb');
    });

    it('尾部英文追问去除', () => {
      const result = (client as any).sanitizeCommitMessage('feat: test\nWould you like me to help?');
      expect(result).toBe('feat: test');
    });

    it('尾部中文追问去除', () => {
      const result = (client as any).sanitizeCommitMessage('feat: test\n需要我帮忙吗？');
      expect(result).toBe('feat: test');
    });
  });

  describe('sanitizeCommitMessage 组合场景', () => {
    const client = createClient();

    it('多重污染清洗为干净的 commit message', () => {
      const input = 'Commit message: feat: feat: test\n\n\n\nWould you like me to help?';
      const result = (client as any).sanitizeCommitMessage(input);
      expect(result).toBe('feat: test');
    });

    it('markdown 代码块 + AI 前缀 + 重复前缀组合清洗', () => {
      const input = '```\nCommit message: feat: feat(config): test\n```';
      const result = (client as any).sanitizeCommitMessage(input);
      expect(result).toBe('feat(config): test');
    });
  });

  describe('sanitizeCommitMessage body 折行', () => {
    const client = createClient();

    it('超过 72 字符的 body 行被折行', () => {
      const longLine = '这是一行非常非常长的中文描述，'.repeat(10); // 150 字符
      const result = (client as any).sanitizeCommitMessage(`feat: test\n\n${longLine}`);
      const bodyLines = result.split('\n').slice(1);
      expect(bodyLines.length).toBeGreaterThan(1);
      for (const line of bodyLines) {
        expect(line.length).toBeLessThanOrEqual(72);
      }
    });

    it('header（首行）不折行', () => {
      const longHeader = 'feat: ' + 'a'.repeat(100);
      const result = (client as any).sanitizeCommitMessage(longHeader);
      expect(result.split('\n')[0]).toBe(longHeader);
    });

    it('优先在标点处断行，标点留在行尾', () => {
      const line = '前'.repeat(60) + '，' + '后'.repeat(30);
      const result = (client as any).sanitizeCommitMessage(`feat: test\n\n${line}`);
      const bodyLines = result.split('\n').slice(1).filter((l: string) => l.trim());
      expect(bodyLines[0]).toBe('前'.repeat(60) + '，');
      expect(bodyLines[0].length).toBeLessThanOrEqual(72);
    });

    it('列表项折行后续行缩进对齐', () => {
      // 注意：sanitize 会剥离行首 "- "（防模型回显 diff），故用数字列表验证缩进对齐
      const item = `1. ${'条目内容，'.repeat(20)}`; // 超长的有序列表项
      const result = (client as any).sanitizeCommitMessage(`feat: test\n\n${item}`);
      const lines = result.split('\n');
      expect(lines[2].startsWith('1. ')).toBe(true);
      expect(lines.length).toBeGreaterThan(3);
      // 续行以与 "1. " 等宽的 3 空格缩进，不重复列表标记
      expect(lines[3].startsWith('   ')).toBe(true);
      expect(lines[3].startsWith('   1.')).toBe(false);
      for (const line of lines.slice(2)) {
        expect(line.length).toBeLessThanOrEqual(72);
      }
    });

    it('英文单词不被从中间切断', () => {
      const words = Array.from({ length: 30 }, (_, i) => `wordnumber${i}`).join(' ');
      const result = (client as any).sanitizeCommitMessage(`feat: test\n\n${words}`);
      const bodyLines = result.split('\n').slice(1);
      for (const line of bodyLines) {
        expect(line.length).toBeLessThanOrEqual(72);
      }
      // 所有单词完整保留
      for (let i = 0; i < 30; i++) {
        expect(result).toContain(`wordnumber${i}`);
      }
    });

    it('无空格的超长串硬切，不丢字符', () => {
      const url = `https://example.com/${'a'.repeat(100)}`;
      const result = (client as any).sanitizeCommitMessage(`feat: test\n\n${url}`);
      const bodyLines = result.split('\n').slice(1);
      for (const line of bodyLines) {
        expect(line.length).toBeLessThanOrEqual(72);
      }
      expect(bodyLines.join('')).toBe(url);
    });

    it('短行不受影响', () => {
      const msg = 'feat: test\n\n短 body 行';
      expect((client as any).sanitizeCommitMessage(msg)).toBe(msg);
    });
  });
});
