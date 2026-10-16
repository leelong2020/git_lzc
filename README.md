# lzc

> [English](README_EN.md) | 中文

> Git Lazy Commit — 用 AI 分析 Git 变更，自动生成规范的 commit message。
>
> 支持多种 AI 提供商：Anthropic Claude、OpenAI、豆包 (Doubao)、Kimi (Moonshot)、Ollama 本地部署

---

## 安装

```bash
npm install -g git-lazy-commit
```

## 快速开始

1. **安装工具**
   ```bash
   npm install -g git-lazy-commit
   ```

2. **首次运行**，工具会自动检测并询问是否创建全局配置文件
   ```bash
   git add .
   git-lzc
   ```

3. **编辑配置文件**，设置你的 AI 提供商和 API Key

## 功能特性

- 🤖 **多 AI 提供商支持** — Claude、OpenAI、豆包、Kimi、Ollama
- 📝 **自动生成规范 commit** — 支持 Conventional Commits 规范
- 🌍 **多语言支持** — 中英文 commit message
- ⚙️ **灵活配置** — 支持项目级和全局配置文件
- 📜 **JSON5 格式配置** — 支持注释，配置更直观
- 🔒 **本地部署支持** — 通过 Ollama 使用本地模型，无需联网
- 🎯 **交互式确认** — 可编辑、确认或重新生成 commit message
- 🛡️ **提交规范自愈** — 提交被 commitlint 拒绝时自动分析错误、修正 message 并重试
- 🔄 **向后兼容** — 自动读取旧版 `.json` 配置文件

```
git add .
 ↓
git-lzc
 ↓
git diff --staged → AI 分析变更 → 生成 commit message
 ↓
用户确认 / 编辑（可选）
 ↓
git commit -m "..."
 ↓  提交失败（如 commitlint 校验不通过）
分析错误 → 自动修正 message → 重试提交
```

## 输出示例

```
feat(auth): add OAuth2 login with Google

- integrate google-auth-library for token verification
- add /auth/google callback route
- store user session after successful login
```

---

## 配置

### 配置文件位置

配置文件按照以下优先级读取（优先级从高到低）：

1. **项目级配置**: `<repo-root>/.lzc.json5` — 当前项目的特定配置
2. **全局配置**: `~/.config/git-lzc/lzc.json5` — 用户的全局默认配置
3. **默认配置**: 内置的默认参数

> **兼容旧版**: 项目同时兼容 `.lzc.json`（旧版）和 `.lzc.json5`（新版）文件。若两者同时存在，优先使用 `.lzc.json5`。

### 自动创建全局配置

首次运行 `git-lzc` 时，若未找到全局配置文件，工具会询问是否自动创建：

```bash
git-lzc
# → 未找到全局配置文件，是否自动创建？
# → 路径: ~/.config/git-lzc/lzc.json5
```

确认后，工具会自动生成带注释的默认配置，用户只需编辑即可。

### 配置示例 (`~/.config/git-lzc/lzc.json5`)

```json5
{
  // API 提供商: anthropic, openai, doubao, kimi, ollama
  "apiProvider": "ollama",

  // 模型名称
  "model": "gemma3:latest",

  // 界面语言: zh (中文), en (英文)
  "language": "zh",

  // 是否自动提交 commit: true 或 false
  "autoCommit": false,

  // commit 提交风格: conventional, free
  "commitStyle": "conventional",

  // API 基础 URL (ollama 默认: http://127.0.0.1:11434)
  "baseUrl": "http://127.0.0.1:11434"

  // API 密钥 (使用第三方 API 时需要)
  // "apiKey": "your-api-key-here"
}
```

> **注意**: 你可以将配置文件放在项目根目录作为 `.lzc.json5`，仅对当前项目生效。完整配置示例可参考项目根目录的 `.lzc.example.json5`。

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `apiProvider` | string | `"anthropic"` | AI 提供商: `ollama`, `openai`, `anthropic`, `doubao`, `kimi` |
| `model` | string | `"claude-sonnet-4-20250514"` | AI 模型名称 |
| `language` | string | `"zh"` | 输出语言: `zh` (中文), `en` (英文) |
| `autoCommit` | boolean | `false` | 是否跳过确认直接提交 |
| `commitStyle` | string | `"conventional"` | Commit 风格: `conventional`, `simple`, `detailed` |
| `baseUrl` | string | `null` | API 基础 URL (Ollama 默认: `http://127.0.0.1:11434`) |
| `apiKey` | string | `null` | API 密钥 (可通过环境变量设置) |
| `maxDiffChars` | number | ollama `6000` / 其他 `12000` | diff 内容字符预算，超出后按文件粒度截断，`0` 表示不限制。本地小模型建议 `4000`-`8000` |
| `diffExcludePatterns` | string[] | 锁文件、`dist/` 等 | diff 噪音文件排除模式（内容不发送给 AI，仅在统计中保留），支持 `*` 与 `**` glob |
| `numCtx` | number | Ollama 默认值 | Ollama 上下文窗口大小（`num_ctx`），本地小模型建议 `8192` |
| `think` | boolean | `false` | Ollama 思考模式；思考型模型（qwen3、gemma4 等）开启后可能耗尽输出预算导致无结果 |

### 环境变量

```bash
# Anthropic
export ANTHROPIC_API_KEY="your-key"

# OpenAI
export OPENAI_API_KEY="your-key"

# 豆包
export DOUBAO_API_KEY="your-key"

# Kimi
export KIMI_API_KEY="your-key"

# Ollama (可选，自定义地址)
export OLLAMA_HOST="http://localhost:11434"
```

## 命令用法

```bash
git-lzc              # 分析暂存区变更并生成 commit message
git-lzc -y           # 跳过确认，直接提交
git-lzc --lang zh    # 指定语言（覆盖配置文件）
git-lzc --dry-run    # 只输出 message，不执行 commit
git-lzc --model <id> # 指定模型（覆盖配置文件）
git-lzc -h           # 显示帮助信息
```

### 工作流程示例

```bash
# 1. 暂存变更
git add .

# 2. 运行 git-lzc 生成 commit
git-lzc

# 3. 确认或编辑生成的 commit message

# 4. 完成提交
```

---

## 开发

```bash
pnpm install
pnpm run build          # 编译 TypeScript
pnpm link --global      # 本地链接，把 git-lzc 命令装到全局（开发调试用）
```

### 打包与发布

`pnpm run build` 仅将 TypeScript 编译到 `dist/`；要分发给用户，需打成 npm tarball。

```bash
# 1. 编译（必须：pnpm pack 不会自动执行 build）
pnpm run build

# 2. 预览打包内容（只列清单，不生成文件）
pnpm pack --dry-run

# 3. 生成 tarball：git-lazy-commit-1.0.0.tgz
pnpm pack

# 4. 本地验证：全局安装 tarball 后运行
#    注意：pnpm 全局安装需用绝对路径，相对路径会被解析到全局安装目录而报 ENOENT
pnpm add -g "$(pwd)/git-lazy-commit-1.0.0.tgz"
#    或用 npm（相对路径按当前目录解析）：
#    npm install -g ./git-lazy-commit-1.0.0.tgz
git-lzc --help

# 5. 发布到 npm（自动执行 prepublishOnly：test + clean + build）
pnpm publish --access public
```

> `files` 白名单已包含 `dist/`、`bin/` 与文档，因此即使 `dist/` 被 `.gitignore` 忽略，也会正常打进包。
> 注意：`pnpm pack` 只触发 `prepack`/`prepare`，**不会**执行 `prepublishOnly`，所以手动 `pack` 前必须先 `pnpm run build`；`pnpm publish` 则会自动重新编译。
> 安装 tarball 请用 `pnpm add -g <绝对路径>`（`pnpm install` 不支持 `-g`）。pnpm 的全局安装会**相对全局安装目录**（如 `~/.local/share/pnpm/global/5`）解析路径，因此 `./x.tgz` 会报 `ENOENT`，请传绝对路径，如 `pnpm add -g "$(pwd)/git-lazy-commit-1.0.0.tgz"`；`npm install -g ./x.tgz` 则按当前目录解析。

---

## License

MIT
