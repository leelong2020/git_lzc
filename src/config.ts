import fs from 'fs';
import path from 'path';
import os from 'os';
import { LzcConfig, ApiProvider } from './types';

const DEFAULT_CONFIG: LzcConfig = {
  model: 'claude-sonnet-4-20250514',
  language: 'zh',
  autoCommit: false,
  commitStyle: 'conventional',
  apiProvider: 'anthropic'
};

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', 'git-lzc');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'lzc.json');

export class Config {
  private config: LzcConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  load(repoRoot: string): void {
    const localConfigPath = path.join(repoRoot, '.lzc.json');

    // 读取全局配置文件
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      try {
        const globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf8'));
        this.config = { ...this.config, ...globalConfig };
      } catch (error) {
        console.warn(`⚠️  读取全局配置文件失败: ${(error as Error).message}`);
      }
    } else {
      // 配置文件不存在，显示提示
      console.log(`ℹ️  未找到全局配置文件: ${GLOBAL_CONFIG_PATH}`);
      console.log(`   请将配置文件放置在: ${GLOBAL_CONFIG_PATH}`);
      console.log(`   示例配置文件可参考项目中的 .lzc.example.json`);
      console.log();
    }

    if (fs.existsSync(localConfigPath)) {
      try {
        const localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
        this.config = { ...this.config, ...localConfig };
      } catch (error) {
        console.warn(`⚠️  读取本地配置文件失败: ${(error as Error).message}`);
      }
    }
  }

  get(): LzcConfig {
    return this.config;
  }

  getGlobalConfigPath(): string {
    return GLOBAL_CONFIG_PATH;
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
