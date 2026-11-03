#!/usr/bin/env bash
#
# Git Lazy Commit — 离线安装脚本（Linux / macOS）
#
# 用法:
#   ./install.sh [选项]
#
# 选项:
#   --prefix DIR    安装目录（默认: ~/.local/share/git-lzc）
#   --bin-dir DIR   可执行文件目录（默认: ~/.local/bin）
#   -y, --yes       非交互模式（不修改 shell 配置）
#   --add-path      自动把 bin 目录写入 shell 配置（~/.zshrc / ~/.bashrc / ~/.profile）
#   --no-path       不修改 shell 配置，也不提示
#   -h, --help      显示帮助
#
# 环境变量:
#   LZC_PREFIX      等价于 --prefix
#   LZC_BIN_DIR     等价于 --bin-dir
#
# 运行要求: Node.js >= 16、Git（仅运行工具时需要）；无需联网。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="$SCRIPT_DIR/app"

DEFAULT_PREFIX="${LZC_PREFIX:-$HOME/.local/share/git-lzc}"
DEFAULT_BIN_DIR="${LZC_BIN_DIR:-$HOME/.local/bin}"

PREFIX="$DEFAULT_PREFIX"
BIN_DIR="$DEFAULT_BIN_DIR"
ASSUME_YES=0
ADD_PATH=0
NO_PATH=0

info() { printf '%s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*" >&2; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

usage() {
  awk 'NR > 1 && /^set -euo pipefail/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

expand_path() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${1#\~/}" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

trim_trailing_slash() {
  local value="$1"
  while [ "${#value}" -gt 1 ] && [ "${value%/}" != "$value" ]; do
    value="${value%/}"
  done
  printf '%s\n' "$value"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix)
      [ "$#" -ge 2 ] || die "--prefix 需要参数"
      PREFIX="$2"
      shift 2
      ;;
    --prefix=*)
      PREFIX="${1#*=}"
      shift
      ;;
    --bin-dir)
      [ "$#" -ge 2 ] || die "--bin-dir 需要参数"
      BIN_DIR="$2"
      shift 2
      ;;
    --bin-dir=*)
      BIN_DIR="${1#*=}"
      shift
      ;;
    -y|--yes)
      ASSUME_YES=1
      shift
      ;;
    --add-path)
      ADD_PATH=1
      shift
      ;;
    --no-path)
      NO_PATH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --version)
      if [ -f "$APP_SRC/package.json" ]; then
        node -e 'console.log(require(process.argv[1]).version)' "$APP_SRC/package.json"
      else
        info "unknown"
      fi
      exit 0
      ;;
    *)
      die "未知参数: $1（使用 --help 查看用法）"
      ;;
  esac
done

PREFIX="$(trim_trailing_slash "$(expand_path "$PREFIX")")"
BIN_DIR="$(trim_trailing_slash "$(expand_path "$BIN_DIR")")"

case "$PREFIX" in
  ""|"/"|"$HOME") die "拒绝安装到危险路径: '$PREFIX'" ;;
esac
case "$BIN_DIR" in
  ""|"/") die "非法的 --bin-dir: '$BIN_DIR'" ;;
esac

# --- 环境与安装包检查 -------------------------------------------------------

command -v node >/dev/null 2>&1 || die "未找到 node，请先安装 Node.js >= 16（可离线安装）"

NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
[ "$NODE_MAJOR" -ge 16 ] || die "Node.js 版本过低（当前 $NODE_VERSION），需要 >= 16"

command -v git >/dev/null 2>&1 || warn "未找到 git，安装后需先安装 Git 才能使用本工具"

[ -f "$APP_SRC/bin/lzc.js" ] || die "安装包不完整: 未找到 app/bin/lzc.js"
[ -f "$APP_SRC/dist/index.js" ] || die "安装包不完整: 未找到 app/dist/index.js"
[ -d "$APP_SRC/node_modules" ] || die "安装包不完整: 未找到 app/node_modules（请确认使用完整离线包）"

VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$APP_SRC/package.json" 2>/dev/null || printf 'unknown')"

if [ -f "$PREFIX/package.json" ]; then
  OLD_VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PREFIX/package.json" 2>/dev/null || printf 'unknown')"
  info "检测到已安装版本: $OLD_VERSION，将升级到 $VERSION"
else
  info "准备安装 Git Lazy Commit $VERSION"
fi

info "   安装目录: $PREFIX"
info "   命令目录: $BIN_DIR"
info ""

# --- 复制文件（先写入临时目录，成功后原子替换）------------------------------

mkdir -p "$(dirname "$PREFIX")" "$BIN_DIR"
PREFIX="$(cd "$(dirname "$PREFIX")" && pwd)/$(basename "$PREFIX")"
BIN_DIR="$(cd "$BIN_DIR" && pwd)"

STAGING="$(mktemp -d "${PREFIX}.new.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT

cp -R "$APP_SRC/." "$STAGING/"
chmod +x "$STAGING/bin/lzc.js"

if [ -f "$SCRIPT_DIR/uninstall.sh" ]; then
  cp "$SCRIPT_DIR/uninstall.sh" "$STAGING/uninstall.sh"
  chmod +x "$STAGING/uninstall.sh"
fi

{
  printf 'PREFIX=%s\n' "$PREFIX"
  printf 'BIN_DIR=%s\n' "$BIN_DIR"
  printf 'VERSION=%s\n' "$VERSION"
} > "$STAGING/.lzc-install-info"

info "▶ 自检安装包 ..."
if ! CHECK_OUTPUT="$(node "$STAGING/bin/lzc.js" --version 2>&1)"; then
  printf '%s\n' "$CHECK_OUTPUT" >&2
  die "安装包自检失败，请重新下载完整离线包"
fi
info "   自检通过: $CHECK_OUTPUT"

BACKUP=""
if [ -e "$PREFIX" ]; then
  BACKUP="${PREFIX}.old.$$"
  mv "$PREFIX" "$BACKUP"
fi

if ! mv "$STAGING" "$PREFIX"; then
  if [ -n "$BACKUP" ] && [ -e "$BACKUP" ]; then
    mv "$BACKUP" "$PREFIX"
  fi
  die "写入安装目录失败: $PREFIX（请检查目录权限）"
fi
trap - EXIT
[ -n "$BACKUP" ] && rm -rf "$BACKUP"

# --- 生成启动器 -------------------------------------------------------------

escaped_prefix="${PREFIX//\\/\\\\}"
escaped_prefix="${escaped_prefix//\"/\\\"}"
escaped_prefix="${escaped_prefix//\$/\\\$}"
escaped_prefix="${escaped_prefix//\`/\\\`}"

LAUNCHER_TMP="$BIN_DIR/.git-lzc.$$"
{
  printf '#!/usr/bin/env sh\n'
  printf '# Git Lazy Commit 启动器（由 install.sh 自动生成）\n'
  printf 'exec node "%s/bin/lzc.js" "$@"\n' "$escaped_prefix"
} > "$LAUNCHER_TMP"
chmod 755 "$LAUNCHER_TMP"
mv "$LAUNCHER_TMP" "$BIN_DIR/git-lzc"

if ! "$BIN_DIR/git-lzc" --version >/dev/null 2>&1; then
  warn "启动器已生成，但执行失败，请检查 node 是否在 PATH 中"
fi

# --- PATH 配置 --------------------------------------------------------------

path_contains() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

detect_rc_file() {
  case "${SHELL:-}" in
    *zsh) printf '%s\n' "$HOME/.zshrc" ;;
    *bash) printf '%s\n' "$HOME/.bashrc" ;;
    *)
      if [ -f "$HOME/.zshrc" ]; then
        printf '%s\n' "$HOME/.zshrc"
      elif [ -f "$HOME/.bashrc" ]; then
        printf '%s\n' "$HOME/.bashrc"
      else
        printf '%s\n' "$HOME/.profile"
      fi
      ;;
  esac
}

add_path_to_rc() {
  local rc_file="$1"
  local escaped_bin="$2"

  touch "$rc_file"
  if grep -qF '# >>> git-lzc installer >>>' "$rc_file" 2>/dev/null; then
    info "   $rc_file 中已存在 PATH 配置，跳过"
    return 0
  fi

  {
    printf '\n# >>> git-lzc installer >>>\n'
    printf 'export PATH="%s:$PATH"\n' "$escaped_bin"
    printf '# <<< git-lzc installer <<<\n'
  } >> "$rc_file"
  info "   已写入 $rc_file"
}

if [ "$NO_PATH" -eq 0 ] && ! path_contains "$BIN_DIR"; then
  DO_ADD_PATH=0

  if [ "$ADD_PATH" -eq 1 ]; then
    DO_ADD_PATH=1
  elif [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ] && [ -t 1 ]; then
    printf '是否将 %s 添加到 PATH? [Y/n] ' "$BIN_DIR"
    read -r answer || answer=""
    case "$answer" in
      ""|y|Y|yes|YES) DO_ADD_PATH=1 ;;
      *) DO_ADD_PATH=0 ;;
    esac
  fi

  if [ "$DO_ADD_PATH" -eq 1 ]; then
    escaped_bin="${BIN_DIR//\\/\\\\}"
    escaped_bin="${escaped_bin//\"/\\\"}"
    escaped_bin="${escaped_bin//\$/\\\$}"
    escaped_bin="${escaped_bin//\`/\\\`}"
    add_path_to_rc "$(detect_rc_file)" "$escaped_bin"
    info ""
    info "▶ PATH 将在新终端生效；当前终端可执行:"
    info "   export PATH=\"$BIN_DIR:\$PATH\""
  else
    info ""
    warn "PATH 中不包含 $BIN_DIR"
    info "   可手动加入，或重新执行: ./install.sh --add-path"
  fi
fi

# --- 完成 -------------------------------------------------------------------

info ""
info "✅ Git Lazy Commit $VERSION 安装完成"
info "   程序目录: $PREFIX"
info "   执行命令: $BIN_DIR/git-lzc"
info "   全局配置: ~/.config/git-lzc/lzc.json5（首次运行会提示创建）"
info "   示例配置: $PREFIX/.lzc.example.json5"
info ""
info "开始使用:"
info "   git add ."
info "   git-lzc"
info ""
info "卸载: $PREFIX/uninstall.sh"
