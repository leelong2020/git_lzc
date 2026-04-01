import axios from 'axios';
import { LzcConfig, PromptData, AnthropicResponse, OpenAIResponse } from './types';

export class AIClient {
  private config: LzcConfig;

  constructor(config: LzcConfig) {
    this.config = config;
  }

  async generateCommitMessage(diff: string): Promise<string> {
    const apiKey = this.config.apiKey;

    if (!apiKey) {
      const envVar = this.config.apiProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
      throw new Error(`未设置 API Key。请设置环境变量 ${envVar} 或在配置文件中添加 apiKey`);
    }

    const maxDiffLength = 8000;
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.slice(0, maxDiffLength) + '\n... (diff 已截断)'
      : diff;

    const prompt = this.buildPrompt(truncatedDiff);

    try {
      if (this.config.apiProvider === 'openai') {
        return await this.callOpenAI(prompt, apiKey);
      } else {
        return await this.callAnthropic(prompt, apiKey);
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`API 调用失败: ${error.response.status} - ${error.response.data?.error?.message || error.message}`);
      }
      throw new Error(`API 调用失败: ${(error as Error).message}`);
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
        ? '请使用 Conventional Commits 规范生成提交信息。格式: <type>(<scope>): <subject>\\n\\n<body>。类型可选: feat, fix, docs, style, refactor, perf, test, chore。'
        : 'Use Conventional Commits format: <type>(<scope>): <subject>\\n\\n<body>. Types: feat, fix, docs, style, refactor, perf, test, chore.';
    }

    const userPrompt = isChinese
      ? `根据以下 Git diff 生成简洁的 commit message，直接输出 message 内容，不要有任何额外说明：\n\n${diff}`
      : `Generate a concise commit message based on the following Git diff. Output only the message content, no extra explanations:\n\n${diff}`;

    return { systemPrompt, userPrompt };
  }

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
}
