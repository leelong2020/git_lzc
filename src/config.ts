import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';
import JSON5 from 'json5';
import { LzcConfig, ApiProvider } from './types';

const DEFAULT_CONFIG: LzcConfig = {
  model: 'claude-sonnet-4-20250514',
  language: 'zh',
  autoCommit: false,
  commitStyle: 'conventional',
  apiProvider: 'anthropic'
};

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.config', 'git-lzc');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, 'lzc.json5');
// 兼容旧版 .json 配置文件
const GLOBAL_CONFIG_LEGACY_PATH = path.join(GLOBAL_CONFIG_DIR, 'lzc.json');

export class Config {
  private config: LzcConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  private getDefaultConfigContent(): string {
    return `{
  // API 提供商: anthropic, openai, doubao, kimi, ollama
  "apiProvider": "${DEFAULT_CONFIG.apiProvider}",

  // 模型名称
  "model": "${DEFAULT_CONFIG.model}",

  // 界面语言: zh (中文), en (英文)
  "language": "${DEFAULT_CONFIG.language}",

  // 是否自动提交 commit: true 或 false
  "autoCommit": ${DEFAULT_CONFIG.autoCommit},

  // commit 提交风格: conventional, free
  "commitStyle": "${DEFAULT_CONFIG.commitStyle}",

  // API 基础 URL (可选)
  // "baseUrl": "",

  // API 密钥 (使用第三方 API 时需要)
  // "apiKey": "your-api-key-here"
}`;
  }

  async load(repoRoot: string): Promise<void> {
    // 本地配置优先读取 .lzc.json5，兼容旧版 .lzc.json
    const localConfigPath = path.join(repoRoot, '.lzc.json5');
    const localConfigLegacyPath = path.join(repoRoot, '.lzc.json');

    // 读取全局配置文件（优先 json5，兼容旧版 json）
    const globalConfigPath = fs.existsSync(GLOBAL_CONFIG_PATH)
      ? GLOBAL_CONFIG_PATH
      : fs.existsSync(GLOBAL_CONFIG_LEGACY_PATH)
        ? GLOBAL_CONFIG_LEGACY_PATH
        : null;

    if (globalConfigPath) {
      try {
        const globalConfig = JSON5.parse(fs.readFileSync(globalConfigPath, 'utf8'));
        this.config = { ...this.config, ...globalConfig };
      } catch (error) {
        console.warn(`⚠️  读取全局配置文件失败: ${(error as Error).message}`);
      }
    } else {
      // 配置文件不存在，询问用户是否自动创建
      const { shouldCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldCreate',
          message: `未找到全局配置文件，是否自动创建？\n  路径: ${GLOBAL_CONFIG_PATH}`,
          default: true
        }
      ]);

      if (shouldCreate) {
        if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
          fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(
          GLOBAL_CONFIG_PATH,
          this.getDefaultConfigContent(),
          'utf8'
        );
        console.log(chalk.green(`✅ 已创建全局配置文件: ${GLOBAL_CONFIG_PATH}`));
        this.config = { ...DEFAULT_CONFIG };
      } else {
        console.log(`ℹ️  未找到全局配置文件: ${GLOBAL_CONFIG_PATH}`);
        console.log(`   请将配置文件放置在: ${GLOBAL_CONFIG_PATH}`);
        console.log(`   示例配置文件可参考项目中的 .lzc.example.json`);
        console.log();
      }
    }

    // 读取本地配置文件（优先 json5，兼容旧版 json）
    const activeLocalPath = fs.existsSync(localConfigPath)
      ? localConfigPath
      : fs.existsSync(localConfigLegacyPath)
        ? localConfigLegacyPath
        : null;

    if (activeLocalPath) {
      try {
        const localConfig = JSON5.parse(fs.readFileSync(activeLocalPath, 'utf8'));
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
