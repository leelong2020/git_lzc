# lzc

> Lazy Commit — 用 AI 分析 Git 变更，自动生成规范的 commit message。

---

## 安装

```bash
npm install -g lzc
```

---

## 使用

```bash
git add .
lzc
```

---

## 工作流程

```
git add .
 ↓
lzc
 ↓
git diff --staged → AI 分析变更 → 生成 commit message
 ↓
用户确认 / 编辑（可选）
 ↓
git commit -m "..."
```

---

## 输出示例

```
feat(auth): add OAuth2 login with Google

- integrate google-auth-library for token verification
- add /auth/google callback route
- store user session after successful login
```

---

## 配置

配置文件路径优先级：`<项目根>/.lzc.json` > `~/.lzc.json`

```json
{
  "model": "claude-sonnet-4-20250514",
  "language": "zh",
  "autoCommit": false,
  "commitStyle": "conventional",
  "apiProvider": "anthropic",
  "apiKey": "your-api-key",
  "baseUrl": "optional-custom-endpoint"
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `model` | `claude-sonnet-4-20250514` | 使用的模型 |
| `language` | `en` | commit message 语言，支持 `en` / `zh` |
| `autoCommit` | `false` | 跳过确认直接提交 |
| `commitStyle` | `conventional` | 支持 `conventional` / `free` |
| `apiProvider` | `anthropic` | API 提供商，支持 `anthropic` / `openai` / `doubao` / `kimi` / `ollama` |
| `apiKey` | `null` | API Key，也可通过环境变量设置 |
| `baseUrl` | `null` | 自定义 API 端点（可选） |

### 支持的 AI 提供商

| 提供商 | 环境变量 | 默认端点 |
|--------|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` | https://api.anthropic.com |
| OpenAI | `OPENAI_API_KEY` | https://api.openai.com |
| 豆包 (Doubao) | `DOUBAO_API_KEY` | https://ark.cn-beijing.volces.com/api/v3 |
| Kimi (Moonshot) | `KIMI_API_KEY` | https://api.moonshot.cn/v1 |
| Ollama | 不需要 | http://localhost:11434 |

### 环境变量

```bash
# Anthropic
export ANTHROPIC_API_KEY="your-anthropic-key"

# OpenAI
export OPENAI_API_KEY="your-openai-key"

# 豆包 (字节跳动)
export DOUBAO_API_KEY="your-doubao-key"

# Kimi (Moonshot)
export KIMI_API_KEY="your-kimi-key"

# Ollama (可选，自定义地址)
export OLLAMA_HOST="http://localhost:11434"
```

### 配置示例

**使用豆包：**
```json
{
  "apiProvider": "doubao",
  "model": "doubao-pro-32k",
  "language": "zh"
}
```

**使用 Kimi：**
```json
{
  "apiProvider": "kimi",
  "model": "moonshot-v1-8k",
  "language": "zh"
}
```

**使用 Ollama（本地）：**
```json
{
  "apiProvider": "ollama",
  "model": "qwen2.5-coder:7b",
  "language": "zh"
}
```

---

## 命令参数

```bash
lzc              # 标准交互模式
lzc -y           # 跳过确认，直接提交
lzc --lang zh    # 指定语言（覆盖配置文件）
lzc --dry-run    # 只输出 message，不执行 commit
lzc --model <id> # 指定模型
```

---

## 开发

```bash
cd code/lzc
npm install
npm run build     # 编译 TypeScript
npm link          # 本地链接测试
```

---

## License

MIT
