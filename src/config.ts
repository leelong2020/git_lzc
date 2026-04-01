import fs from 'fs';
import path from 'path';
import os from 'os';
import { LzcConfig, ApiProvider } from './types';

const DEFAULT_CONFIG: LzcConfig = {
  model: 'claude-sonnet-4-20250514',
  language: 'en',
  autoCommit: false,
  commitStyle: 'conventional',
  apiProvider: 'anthropic'
};

export class Config {
  private config: LzcConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  load(repoRoot: string): void {
    const globalConfigPath = path.join(os.homedir(), '.lzc.json');
    const localConfigPath = path.join(repoRoot, '.lzc.json');

    if (fs.existsSync(globalConfigPath)) {
      try {
        const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
        this.config = { ...this.config, ...globalConfig };
      } catch (error) {
        console.warn(`警告: 读取全局配置文件失败: ${(error as Error).message}`);
      }
    }

    if (fs.existsSync(localConfigPath)) {
      try {
        const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
        this.config = { ...this.config, ...localConfig };
      } catch (error) {
        console.warn(`警告: 读取本地配置文件失败: ${(error as Error).message}`);
      }
    }
  }

  get(): LzcConfig {
    return this.config;
  }

  getApiKey(): string | undefined {
    const provider = this.config.apiProvider;
    
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY || this.config.apiKey;
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || this.config.apiKey;
      case 'doubao':
        return process.env.DOUBAO_API_KEY || this.config.apiKey;
      case 'kimi':
        return process.env.KIMI_API_KEY || this.config.apiKey;
      case 'ollama':
        // Ollama 不需要 API Key
        return undefined;
      default:
        return this.config.apiKey;
    }
  }

  getBaseUrl(): string | undefined {
    const provider = this.config.apiProvider;
    const customUrl = this.config.baseUrl;
    
    if (customUrl) return customUrl;
    
    switch (provider) {
      case 'doubao':
        return 'https://ark.cn-beijing.volces.com/api/v3';
      case 'kimi':
        return 'https://api.moonshot.cn/v1';
      case 'ollama':
        return process.env.OLLAMA_HOST || 'http://localhost:11434';
      default:
        return undefined;
    }
  }
}
