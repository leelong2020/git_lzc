# lzc

> English | [中文](README.md)

> Git Lazy Commit — Analyze Git changes with AI and automatically generate standardized commit messages.
>
> Supports multiple AI providers: Anthropic Claude, OpenAI, Doubao, Kimi (Moonshot), Ollama (local deployment)

---

## Installation

```bash
npm install -g git-lazy-commit
```

## Quick Start

1. **Install the tool**
   ```bash
   npm install -g git-lazy-commit
   ```

2. **Run for the first time**, the tool will automatically detect and ask whether to create a global configuration file
   ```bash
   git add .
   git-lzc
   ```

3. **Edit the configuration file**, set your AI provider and API Key

## Features

- 🤖 **Multi AI Provider Support** — Claude, OpenAI, Doubao, Kimi, Ollama
- 📝 **Auto-generate Standardized Commits** — Supports Conventional Commits specification
- 🌍 **Multi-language Support** — Chinese and English commit messages
- ⚙️ **Flexible Configuration** — Supports project-level and global configuration files
- 📜 **JSON5 Format Configuration** — Supports comments for more intuitive configuration
- 🔒 **Local Deployment Support** — Use local models via Ollama, no internet required
- 🎯 **Interactive Confirmation** — Edit, confirm, or regenerate commit messages
- 🛡️ **Commit-lint Self-healing** — When a commit is rejected by commitlint, analyze the error, fix the message, and retry automatically
- 🔄 **Backward Compatible** — Automatically reads legacy `.json` configuration files

```
git add .
 ↓
git-lzc
 ↓
git diff --staged → AI Analysis → Generate commit message
 ↓
User confirmation / editing (optional)
 ↓
git commit -m "..."
 ↓  commit failed (e.g. commitlint validation)
Analyze error → auto-fix message → retry commit
```

## Output Example

```
feat(auth): add OAuth2 login with Google

- integrate google-auth-library for token verification
- add /auth/google callback route
- store user session after successful login
```

---

## Configuration

### Configuration File Locations

Configuration files are read in the following priority order (highest to lowest):

1. **Project-level config**: `<repo-root>/.lzc.json5` — Project-specific configuration
2. **Global config**: `~/.config/git-lzc/lzc.json5` — User's global default configuration
3. **Default config**: Built-in default parameters

> **Backward Compatible**: The tool supports both `.lzc.json` (legacy) and `.lzc.json5` (new) files. If both exist, `.lzc.json5` takes priority.

### Auto-create Global Configuration

When running `git-lzc` for the first time, if no global configuration file is found, the tool will ask whether to create one automatically:

```bash
git-lzc
# → Global configuration file not found. Create automatically?
# → Path: ~/.config/git-lzc/lzc.json5
```

After confirmation, the tool will generate a default configuration with comments. Users only need to edit it.

### Configuration Example (`~/.config/git-lzc/lzc.json5`)

```json5
{
  // API Provider: anthropic, openai, doubao, kimi, ollama
  "apiProvider": "ollama",

  // Model name
  "model": "gemma3:latest",

  // Interface language: zh (Chinese), en (English)
  "language": "zh",

  // Whether to auto-commit: true or false
  "autoCommit": false,

  // Commit style: conventional, free
  "commitStyle": "conventional",

  // API base URL (ollama default: http://127.0.0.1:11434)
  "baseUrl": "http://127.0.0.1:11434"

  // API key (required when using third-party APIs)
  // "apiKey": "your-api-key-here"
}
```

> **Note**: You can place a configuration file in the project root as `.lzc.json5` to apply only to the current project. See `.lzc.example.json5` in the project root for a complete configuration example.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiProvider` | string | `"anthropic"` | AI provider: `ollama`, `openai`, `anthropic`, `doubao`, `kimi` |
| `model` | string | `"claude-sonnet-4-20250514"` | AI model name |
| `language` | string | `"zh"` | Output language: `zh` (Chinese), `en` (English) |
| `autoCommit` | boolean | `false` | Skip confirmation and commit directly |
| `commitStyle` | string | `"conventional"` | Commit style: `conventional`, `simple`, `detailed` |
| `baseUrl` | string | `null` | API base URL (Ollama default: `http://127.0.0.1:11434`) |
| `apiKey` | string | `null` | API key (can also be set via environment variables) |
| `maxDiffChars` | number | ollama `6000` / others `12000` | Character budget for diff content; truncated per-file when exceeded, `0` means unlimited. Recommended `4000`-`8000` for small local models |
| `diffExcludePatterns` | string[] | lock files, `dist/`, etc. | Noise file exclusion patterns (content is not sent to AI, kept only in statistics); supports `*` and `**` globs |
| `numCtx` | number | Ollama default | Ollama context window size (`num_ctx`), recommended `8192` for small local models |
| `think` | boolean | `false` | Ollama thinking mode; thinking models (qwen3, gemma4, etc.) may exhaust the output budget and return empty results when enabled |

### Environment Variables

```bash
# Anthropic
export ANTHROPIC_API_KEY="your-key"

# OpenAI
export OPENAI_API_KEY="your-key"

# Doubao
export DOUBAO_API_KEY="your-key"

# Kimi
export KIMI_API_KEY="your-key"

# Ollama (optional, custom address)
export OLLAMA_HOST="http://localhost:11434"
```

## Command Usage

```bash
git-lzc              # Analyze staged changes and generate commit message
git-lzc -y           # Skip confirmation and commit directly
git-lzc --lang zh    # Specify language (overrides config file)
git-lzc --dry-run    # Only output message, do not execute commit
git-lzc --model <id> # Specify model (overrides config file)
git-lzc -h           # Show help information
```

### Workflow Example

```bash
# 1. Stage changes
git add .

# 2. Run git-lzc to generate commit
git-lzc

# 3. Confirm or edit the generated commit message

# 4. Commit completed
```

---

## Development

```bash
pnpm install
pnpm run build          # Compile TypeScript
pnpm link --global      # Link locally, install the git-lzc command globally (for development)
```

### Packaging & Publishing

`pnpm run build` only compiles TypeScript into `dist/`; to distribute the CLI you need to pack it into an npm tarball.

```bash
# 1. Compile (required: pnpm pack does NOT run build automatically)
pnpm run build

# 2. Preview the tarball contents (dry run, no file written)
pnpm pack --dry-run

# 3. Create the tarball: git-lazy-commit-1.0.0.tgz
pnpm pack

# 4. Verify locally: install the tarball globally and run it
#    Note: pnpm global install needs an absolute path; a relative path is resolved
#    against the global install dir and fails with ENOENT
pnpm add -g "$(pwd)/git-lazy-commit-1.0.0.tgz"
#    or use npm (relative paths resolve against the current directory):
#    npm install -g ./git-lazy-commit-1.0.0.tgz
git-lzc --help

# 5. Publish to npm (runs prepublishOnly: test + clean + build)
pnpm publish --access public
```

> The `files` whitelist already includes `dist/`, `bin/` and the docs, so `dist/` is packaged correctly even though it is listed in `.gitignore`.
> Note: `pnpm pack` only triggers `prepack`/`prepare` and does **not** run `prepublishOnly`, so run `pnpm run build` manually before packing; `pnpm publish` rebuilds automatically.
> To install the tarball use `pnpm add -g <absolute-path>` (`pnpm install` does not support `-g`). pnpm global install resolves the path **relative to the global install dir** (e.g. `~/.local/share/pnpm/global/5`), so `./x.tgz` fails with `ENOENT`; pass an absolute path such as `pnpm add -g "$(pwd)/git-lazy-commit-1.0.0.tgz"`. `npm install -g ./x.tgz` resolves relative to the current directory instead.

---

## License

MIT
