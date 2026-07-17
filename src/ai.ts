import axios from 'axios';
import {
  LzcConfig,
  PromptData,
  AnthropicResponse,
  OpenAIResponse,
  DoubaoResponse,
  KimiResponse,
  OllamaResponse,
  OllamaTagsResponse
} from './types';

// body 每行最大字符数，与 prompt 约定一致（commitlint 默认限制 100，取更严的 72）
const BODY_MAX_LINE_LENGTH = 72;

export class AIClient {
  private config: LzcConfig;

  constructor(config: LzcConfig) {
    this.config = config;
  }

  async generateCommitMessage(diff: string): Promise<string> {
    const apiKey = this.config.apiKey;
    const provider = this.config.apiProvider;

    // Ollama 不需要 API Key
    if (!apiKey && provider !== 'ollama') {
      const envVar = this.getEnvVarName(provider);
      throw new Error(`未设置 API Key。请设置环境变量 ${envVar} 或在配置文件中添加 apiKey`);
    }

    if (provider === 'ollama') {
      await this.validateAndFallbackOllamaModel();
    }

    // diff 的截断与噪音过滤已在 DiffProcessor 中完成，此处直接使用
    const prompt = this.buildPrompt(diff);

    let message: string;
    try {
      switch (provider) {
        case 'openai':
          message = await this.callOpenAI(prompt, apiKey!);
          break;
        case 'anthropic':
          message = await this.callAnthropic(prompt, apiKey!);
          break;
        case 'doubao':
          message = await this.callDoubao(prompt, apiKey!);
          break;
        case 'kimi':
          message = await this.callKimi(prompt, apiKey!);
          break;
        case 'ollama':
          message = await this.callOllama(prompt);
          break;
        default:
          throw new Error(`不支持的 API 提供商: ${provider}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`API 调用失败: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
      }
      throw new Error(`API 调用失败: ${(error as Error).message}`);
    }

    const cleaned = this.sanitizeCommitMessage(message);
    if (!cleaned) {
      throw new Error('模型返回的 commit message 为空或无法解析，请重试或更换模型');
    }
    return cleaned;
  }

  private getEnvVarName(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'OPENAI_API_KEY';
      case 'anthropic':
        return 'ANTHROPIC_API_KEY';
      case 'doubao':
        return 'DOUBAO_API_KEY';
      case 'kimi':
        return 'KIMI_API_KEY';
      default:
        return 'API_KEY';
    }
  }

  private buildPrompt(diff: string): PromptData {
    const isConventional = this.config.commitStyle === 'conventional';
    const isChinese = this.config.language === 'zh';
    let systemPrompt: string;
    let userPrompt: string;

    if (isConventional && isChinese) {
      systemPrompt = `你是专业的 Git 提交信息生成助手。严格遵循 Conventional Commits 规范。

格式：<type>(<scope>): <subject>

<body>

规则：
1. type 必须是以下之一：
   - feat: 新功能
   - fix: 修复问题
   - docs: 文档相关
   - style: 代码格式调整（不影响功能）
   - refactor: 代码重构（既不修复 bug 也不添加功能）
   - perf: 性能优化
   - test: 测试相关
   - chore: 构建过程、辅助工具、依赖升级等杂项

2. scope: 变更涉及的模块名，从文件路径推断。常见 scope 如：ai, config, git, cli, deps, docs, types。
   - 如无明确模块或变更跨多个模块，可省略 scope
   - scope 应简洁，不超过 15 个字符

3. subject:
   - 使用中文撰写
   - 不超过 30 个字
   - 使用祈使语气（如"添加"而非"添加了"、"修复"而非"修复了"）
   - 不以句号结尾

4. body:
   - 仅在变更有必要补充说明时添加（如多文件变更、需要解释变更原因）
   - 每行不超过 72 个字符
   - 简单变更（如单文件修改、typo 修复）应省略 body
   - body 与 subject 之间用一个空行分隔

5. 必须只输出 commit message 纯文本，禁止任何额外说明、解释或示例。

示例：

feat(config): 配置文件升级为 JSON5 格式并支持自动创建

fix(ai): 修复 Ollama 模型回退时重复请求的问题

docs(readme): 更新 README 并增加英文版本`;

      userPrompt = `根据以下 Git diff 生成 commit message。要求：
1. 只输出 commit message 纯文本，不要有任何额外说明
2. 严禁输出代码片段、严禁重复 diff 内容
3. 不要添加 markdown 代码块标记
4. 总结变更的核心目的，而不是罗列每行改动
5. 如果变更是简单修改（如单文件、少量改动），省略 body 部分
6. 严格遵循 Conventional Commits 格式
7. body 每行不超过 72 个字符，内容较长时请主动换行

Git diff：
${diff}`;
    } else if (isConventional && !isChinese) {
      systemPrompt = `You are a professional Git commit message generator. Strictly follow the Conventional Commits specification.

Format: <type>(<scope>): <subject>

<body>

Rules:
1. type must be one of:
   - feat: new feature
   - fix: bug fix
   - docs: documentation changes
   - style: code style changes (no functional impact)
   - refactor: code refactoring (neither fix nor feature)
   - perf: performance improvement
   - test: test-related changes
   - chore: build process, tooling, dependency updates, etc.

2. scope: the module being changed, inferred from file paths. Common scopes: ai, config, git, cli, deps, docs, types.
   - Omit if unclear or spanning multiple modules
   - Keep it concise, max 15 chars

3. subject:
   - Written in English
   - Max 50 characters
   - Use imperative mood ("Add" not "Added", "Fix" not "Fixed")
   - Lowercase first letter
   - No trailing period

4. body:
   - Add only when necessary to explain complex changes (multi-file, rationale needed)
   - Wrap each line at max 72 characters
   - Omit for simple changes (single file, typo fix)
   - Separate body from subject with a blank line

5. Output ONLY the commit message plain text. No extra explanations, notes, or examples.

Examples:

feat(config): upgrade config file to JSON5 with auto-creation

fix(ai): fix duplicate request in Ollama model fallback

docs(readme): update README and add English version`;

      userPrompt = `Generate a commit message based on the following Git diff. Requirements:
1. Output ONLY the commit message plain text, no extra explanations
2. NEVER output code snippets or repeat diff content
3. Do not use markdown code blocks
4. Summarize the core purpose, not every line changed
5. Omit the body for simple changes (single file, minor edits)
6. Strictly follow the Conventional Commits format
7. Wrap body lines at 72 characters; break long sentences into multiple lines

Git diff:
${diff}`;
    } else if (!isConventional && isChinese) {
      systemPrompt = `你是专业的 Git 提交信息生成助手。

规则：
1. 简洁描述变更的核心目的
2. 使用中文撰写，不超过 50 个字
3. 使用祈使语气（"添加"而非"添加了"）
4. 必须只输出 commit message 纯文本，禁止任何额外说明`;

      userPrompt = `根据以下 Git diff 生成简洁的 commit message。要求：
1. 只输出 commit message 纯文本
2. 严禁输出代码片段、严禁重复 diff 内容
3. 不要添加 markdown 代码块标记
4. 总结变更的核心目的

Git diff：
${diff}`;
    } else {
      systemPrompt = `You are a professional Git commit message generator.

Rules:
1. Concisely describe the core purpose of the changes
2. Written in English, max 72 characters
3. Use imperative mood ("Add" not "Added")
4. Output ONLY the commit message plain text. No extra explanations.`;

      userPrompt = `Generate a concise commit message based on the following Git diff. Requirements:
1. Output ONLY the commit message plain text
2. NEVER output code snippets or repeat diff content
3. Do not use markdown code blocks
4. Summarize the core purpose of the changes

Git diff:
${diff}`;
    }

    return { systemPrompt, userPrompt };
  }

  private sanitizeCommitMessage(message: string): string {
    let cleaned = message.trim();

    // 去除 markdown 代码块
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }
    cleaned = cleaned.trim();

    // 去除常见 AI 输出前缀
    const aiPrefixes = [
      /^commit\s*message\s*[:：]\s*/i,
      /^generated\s*commit\s*[:：]\s*/i,
      /^here['']?s?\s+(the\s+)?commit\s*message\s*[:：]\s*/i,
      /^(以下是?)?\s*commit\s*message\s*[:：]\s*/i,
      /^以下(是)?\s*(为)?(您)?生成的\s*commit\s*message\s*[:：]\s*/i,
    ];
    for (const prefix of aiPrefixes) {
      cleaned = cleaned.replace(prefix, '');
    }
    cleaned = cleaned.trim();

    // 去除 diff 前缀 + 或 -
    cleaned = cleaned.split('\n').map(line => {
      if (line.startsWith('+ ') || line.startsWith('- ')) {
        return line.slice(2);
      }
      if (line.startsWith('+') || line.startsWith('-')) {
        return line.slice(1);
      }
      return line;
    }).join('\n');

    // 去除重复的 conventional commit 前缀
    // 例如: "feat: feat: xxx" → "feat: xxx"
    // 例如: "feat: feat(config): xxx" → "feat(config): xxx"
    cleaned = cleaned.replace(
      /^(feat|fix|docs|style|refactor|perf|test|chore)(\([^)]*\))?:\s+(feat|fix|docs|style|refactor|perf|test|chore)(\([^)]*\))?:\s+/i,
      (match, type1, scope1, type2, scope2) => {
        const scope = scope2 || scope1;
        return `${type2}${scope || ''}: `;
      }
    );

    // 规范化冒号后空格：确保只有一个空格
    cleaned = cleaned.replace(
      /^(feat|fix|docs|style|refactor|perf|test|chore)(\([^)]*\))?:\s+/i,
      (match, type, scope) => `${type}${scope || ''}: `
    );

    // 压缩连续空行为最多两个
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // 去除尾部多余内容（AI 常见追问）
    const tailPatterns = [
      /\n+would\s+you\s+like\b.*$/is,
      /\n+需要我.*$/is,
      /\n+请问.*$/is,
      /\n+do\s+you\s+want\b.*$/is,
      /\n+if\s+you\s+need\b.*$/is,
    ];
    for (const pattern of tailPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // body 超长行强制折行：AI 常生成不换行的长段落，
    // 超长行会被 commitlint（body-max-line-length）拒绝
    cleaned = this.wrapBodyLines(cleaned.trim(), BODY_MAX_LINE_LENGTH);

    return cleaned;
  }

  /**
   * body 折行：将超长行在标点/空格处断开，列表项续行保持缩进对齐。
   * 首行（header）不处理；阈值 72 与 prompt 约定一致，同时满足 commitlint 默认 100 的限制。
   */
  private wrapBodyLines(message: string, maxLength: number): string {
    const result: string[] = [];
    message.split('\n').forEach((line, index) => {
      if (index === 0 || line.length <= maxLength) {
        result.push(line);
      } else {
        result.push(...this.wrapLine(line, maxLength));
      }
    });
    return result.join('\n');
  }

  /** 单行折行：列表项提取标记前缀（-、*、1. 等），续行用等宽空格缩进对齐 */
  private wrapLine(line: string, maxLength: number): string[] {
    const prefixMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
    const prefix = prefixMatch?.[1] ?? '';
    const indent = ' '.repeat(prefix.length);

    const chunks: string[] = [];
    let remaining = prefix ? line.slice(prefix.length) : line;
    let first = true;

    while (true) {
      const available = maxLength - (first ? prefix.length : indent.length);
      if (remaining.length <= available) {
        chunks.push((first ? prefix : indent) + remaining);
        break;
      }
      const cut = this.findBreakPoint(remaining, available);
      chunks.push((first ? prefix : indent) + remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
      first = false;
    }
    return chunks;
  }

  /**
   * 寻找折行断点：优先在标点或空格之后断开；
   * 切点落在英文单词中间时先回退到单词边界；
   * 单词保护导致切点过小时放弃保护硬切（如超长 URL）。
   */
  private findBreakPoint(text: string, limit: number): number {
    let cut = Math.min(limit, text.length);
    const isWordChar = (ch: string) => /\w/.test(ch);
    if (cut < text.length && isWordChar(text[cut - 1]) && isWordChar(text[cut])) {
      while (cut > 0 && isWordChar(text[cut - 1])) cut--;
    }
    if (cut < limit * 0.3) {
      cut = Math.min(limit, text.length);
    }
    // 在切点前半段之后找最近的标点/空格，断在其后（中文标点留在行尾）
    const minAcceptable = Math.floor(cut * 0.5);
    for (let i = cut; i > minAcceptable; i--) {
      if (' \t，。；、：,.;:!?！？)）】]'.includes(text[i - 1])) {
        return i;
      }
    }
    return Math.max(cut, 1);
  }

  // Anthropic Claude
  private async callAnthropic(prompt: PromptData, apiKey: string): Promise<string> {
    const response = await axios.post<AnthropicResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.config.model,
        max_tokens: 500,
        system: prompt.systemPrompt,
        messages: [
          { role: 'user', content: prompt.userPrompt }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    return response.data.content[0].text.trim();
  }

  // OpenAI
  private async callOpenAI(prompt: PromptData, apiKey: string): Promise<string> {
    const response = await axios.post<OpenAIResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  // Doubao (字节跳动) - OpenAI 兼容格式
  private async callDoubao(prompt: PromptData, apiKey: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3';
    
    const response = await axios.post<DoubaoResponse>(
      `${baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  // Kimi (Moonshot) - OpenAI 兼容格式
  private async callKimi(prompt: PromptData, apiKey: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.moonshot.cn/v1';
    
    const response = await axios.post<KimiResponse>(
      `${baseUrl}/chat/completions`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    return response.data.choices[0].message.content.trim();
  }

  private async validateAndFallbackOllamaModel(): Promise<void> {
    const baseUrl = this.config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
      const response = await axios.get<OllamaTagsResponse>(`${baseUrl}/api/tags`);
      const models = response.data.models || [];
      if (models.length === 0) {
        throw new Error('Ollama 中未找到可用模型，请先执行 ollama pull <模型名> 拉取模型');
      }
      const availableModelNames = models.map(m => m.name);
      if (!availableModelNames.includes(this.config.model)) {
        const fallbackModel = availableModelNames[0];
        console.warn(`⚠️  配置模型 ${this.config.model} 不可用，已自动切换至 ${fallbackModel}`);
        this.config.model = fallbackModel;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        throw new Error(
          `Ollama 服务未启动或无法连接（地址: ${baseUrl}），请确认 Ollama 是否运行`
        );
      }
      throw error;
    }
  }

  // Ollama (本地部署)
  private async callOllama(prompt: PromptData): Promise<string> {
    const baseUrl = this.config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    
    const response = await axios.post<OllamaResponse>(
      `${baseUrl}/api/chat`,
      {
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        stream: false,
        // 默认关闭思考模式：思考型模型会把 num_predict 预算耗在 thinking 上，导致 content 为空
        think: this.config.think ?? false,
        options: {
          temperature: 0.3,
          num_predict: 500,
          // 配置 numCtx 时扩大上下文窗口，避免长输入被 Ollama 默认 4096 静默截断
          ...(this.config.numCtx && this.config.numCtx > 0
            ? { num_ctx: this.config.numCtx }
            : {})
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.message.content.trim();
  }
}
