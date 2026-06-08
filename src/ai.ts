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

    const maxDiffLength = 8000;
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.slice(0, maxDiffLength) + '\n... (diff 已截断)'
      : diff;

    const prompt = this.buildPrompt(truncatedDiff);

    try {
      let message: string;
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
      return this.sanitizeCommitMessage(message);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`API 调用失败: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
      }
      throw new Error(`API 调用失败: ${(error as Error).message}`);
    }
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

    let systemPrompt = isChinese
      ? '你是一个专业的 Git 提交信息生成助手。'
      : 'You are a professional Git commit message generator.';

    if (isConventional) {
      systemPrompt += isChinese
        ? '请使用 Conventional Commits 规范生成提交信息。格式: <type>(<scope>): <subject>\n\n<body>。类型可选: feat, fix, docs, style, refactor, perf, test, chore。'
        : 'Use Conventional Commits format: <type>(<scope>): <subject>\n\n<body>. Types: feat, fix, docs, style, refactor, perf, test, chore.';
    }

    const userPrompt = isChinese
      ? `根据以下 Git diff 生成简洁的 commit message。要求：\n1. 只输出 commit message 纯文本，不要有任何额外说明\n2. 严禁输出代码片段、严禁重复 diff 内容\n3. 不要添加 markdown 代码块标记\n4. 总结变更的核心目的，而不是罗列每行改动\n\nGit diff：\n${diff}`
      : `Generate a concise commit message based on the following Git diff. Requirements:\n1. Output ONLY the commit message plain text, no extra explanations\n2. NEVER output code snippets or repeat diff content\n3. Do not use markdown code blocks\n4. Summarize the core purpose of the changes, not every line\n\nGit diff:\n${diff}`;

    return { systemPrompt, userPrompt };
  }

  private sanitizeCommitMessage(message: string): string {
    let cleaned = message.trim();
    
    // 去除 markdown 代码块
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    }
    
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
    
    return cleaned.trim();
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
        options: {
          temperature: 0.3,
          num_predict: 500
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
