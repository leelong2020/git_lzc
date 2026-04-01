export interface LzcConfig {
  model: string;
  language: 'en' | 'zh';
  autoCommit: boolean;
  commitStyle: 'conventional' | 'free';
  apiProvider: 'anthropic' | 'openai';
  apiKey?: string;
}

export interface CliOptions {
  yes?: boolean;
  lang?: 'en' | 'zh';
  dryRun?: boolean;
  model?: string;
  style?: 'conventional' | 'free';
}

export interface PromptData {
  systemPrompt: string;
  userPrompt: string;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}
