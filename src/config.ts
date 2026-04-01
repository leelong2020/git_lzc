import fs from 'fs';
import path from 'path';
import os from 'os';
import { LzcConfig } from './types';

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
    if (this.config.apiProvider === 'openai') {
      return process.env.OPENAI_API_KEY || this.config.apiKey;
    }
    return process.env.ANTHROPIC_API_KEY || this.config.apiKey;
  }
}
