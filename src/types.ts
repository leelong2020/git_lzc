export type ApiProvider = 'anthropic' | 'openai' | 'doubao' | 'kimi' | 'ollama';

export interface LzcConfig {
  model: string;
  language: 'en' | 'zh';
  autoCommit: boolean;
  commitStyle: 'conventional' | 'free';
  apiProvider: ApiProvider;
  apiKey?: string;
  baseUrl?: string;
  // diff 内容总字符预算，超出后按文件粒度截断；0 表示不限制
  // 未配置时默认：ollama 6000，其他 provider 12000
  maxDiffChars?: number;
  // diff 噪音文件排除模式（锁文件、构建产物等），支持 * 与 ** glob
  diffExcludePatterns?: string[];
  // Ollama 上下文窗口大小（options.num_ctx），不配置则使用 Ollama 默认值
  numCtx?: number;
  // Ollama 思考模式（think），默认 false
  // 思考型模型（qwen3、gemma4 等）开启后可能把输出预算耗在 thinking 上导致无结果
  think?: boolean;
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
