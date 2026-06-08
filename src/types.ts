export type ApiProvider = 'anthropic' | 'openai' | 'doubao' | 'kimi' | 'ollama';

export interface LzcConfig {
  model: string;
  language: 'en' | 'zh';
  autoCommit: boolean;
  commitStyle: 'conventional' | 'free';
  apiProvider: ApiProvider;
  apiKey?: string;
  baseUrl?: string;
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

// Anthropic
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

// OpenAI
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

// Doubao (字节跳动)
export interface DoubaoMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DoubaoResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Kimi (Moonshot)
export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KimiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Ollama (本地)
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  message: {
    content: string;
  };
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}
