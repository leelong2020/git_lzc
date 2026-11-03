# Git Lazy Commit 离线安装包

本目录是自包含的离线分发包：已内置编译后的程序与全部生产依赖，**安装过程无需联网，也无需执行 `npm install`**。

## 运行要求

- **Node.js >= 16**（`node -v` 检查）
- **Git**（`git --version` 检查）
- 无需 npm、无需访问 npm registry

> 如果客户端没有 Node.js，请先通过内网软件源或离线安装包安装 Node.js。

## Linux / macOS

```bash
tar -xzf git-lzc-*.tar.gz
cd git-lzc-*-offline
./install.sh
```

安装脚本会：

1. 检查 Node.js 与 Git；
2. 把程序安装到 `~/.local/share/git-lzc`；
3. 在 `~/.local/bin` 生成 `git-lzc` 启动器；
4. 按需把 `~/.local/bin` 写入 shell 配置。

常用参数：

```bash
./install.sh --prefix /opt/git-lzc --bin-dir /usr/local/bin   # 自定义目录（可能需要 sudo）
./install.sh --yes --no-path                                 # 非交互安装，不修改 PATH
./install.sh --add-path                                      # 自动写入 shell 配置
```

升级：直接对新版离线包再次执行 `./install.sh`（会原子替换旧版本，配置不受影响）。

卸载：

```bash
~/.local/share/git-lzc/uninstall.sh          # 或 ./uninstall.sh
~/.local/share/git-lzc/uninstall.sh --purge  # 同时删除全局配置
```

安装后直接使用：

```bash
git add .
git-lzc
```

首次运行会提示创建全局配置 `~/.config/git-lzc/lzc.json5`，按需填写 API 提供商、模型与密钥；示例见安装目录下的 `.lzc.example.json5`。

## Windows

在解压后的目录中打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

默认安装到 `%LOCALAPPDATA%\Programs\git-lzc`，并在同目录生成 `git-lzc.cmd`、加入用户 PATH。

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Prefix D:\Tools\git-lzc
powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoPath
```

卸载：

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Programs\git-lzc\install.ps1" -Uninstall
```

## 校验完整性

```bash
sha256sum -c git-lzc-*.tar.gz.sha256
# macOS: shasum -a 256 -c git-lzc-*.tar.gz.sha256
```

## 常见问题

- **提示 `node: command not found`**：先安装 Node.js >= 16，并确认它在 `PATH` 中。
- **提示“安装包不完整”**：请完整解压压缩包，确认 `app/node_modules`、`app/dist`、`app/bin` 均存在。
- **`git-lzc: command not found`（Linux/macOS）**：执行 `export PATH="$HOME/.local/bin:$PATH"`，或重新运行 `./install.sh --add-path`。
- **`git-lzc` 被 PowerShell 拦截**：使用 `powershell -ExecutionPolicy Bypass -File ...`，或打开新的终端。
- **Ollama 用户**：本工具本身离线运行，但生成 commit 仍需访问你配置的 Ollama 地址（默认 `http://localhost:11434`）。
