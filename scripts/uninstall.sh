#!/usr/bin/env bash
#
# Git Lazy Commit — 离线卸载脚本（Linux / macOS）
#
# 用法:
#   ./uninstall.sh [选项]
#   <安装目录>/uninstall.sh [选项]
#
# 选项:
#   --prefix DIR    安装目录（默认: 脚本所在目录，若非安装目录则为 ~/.local/share/git-lzc）
#   --bin-dir DIR   可执行文件目录（默认: ~/.local/bin）
#   --purge         同时删除全局配置 ~/.config/git-lzc
#   -y, --yes       跳过确认
#   -h, --help      显示帮助
#
# 环境变量:
#   LZC_PREFIX / LZC_BIN_DIR

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEFAULT_PREFIX="$HOME/.local/share/git-lzc"
if [ -f "$SCRIPT_DIR/package.json" ] && [ -f "$SCRIPT_DIR/bin/lzc.js" ]; then
  DEFAULT_PREFIX="$SCRIPT_DIR"
fi

PREFIX="${LZC_PREFIX:-$DEFAULT_PREFIX}"
BIN_DIR="${LZC_BIN_DIR:-$HOME/.local/bin}"
BIN_DIR_EXPLICIT=0
[ -n "${LZC_BIN_DIR:-}" ] && BIN_DIR_EXPLICIT=1
PURGE=0
ASSUME_YES=0

info() { printf '%s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*" >&2; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

usage() {
  awk 'NR > 1 && /^set -euo pipefail/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
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
      BIN_DIR_EXPLICIT=1
      shift 2
      ;;
    --bin-dir=*)
      BIN_DIR="${1#*=}"
      BIN_DIR_EXPLICIT=1
      shift
      ;;
    --purge)
      PURGE=1
      shift
      ;;
    -y|--yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "未知参数: $1（使用 --help 查看用法）"
      ;;
  esac
done

[ -d "$PREFIX" ] || die "安装目录不存在: $PREFIX"
PREFIX="$(cd "$PREFIX" && pwd)"

if [ "$BIN_DIR_EXPLICIT" -eq 0 ] && [ -f "$PREFIX/.lzc-install-info" ]; then
  RECORDED_BIN_DIR="$(sed -n 's/^BIN_DIR=//p' "$PREFIX/.lzc-install-info" | head -n 1)"
  if [ -n "$RECORDED_BIN_DIR" ]; then
    BIN_DIR="$RECORDED_BIN_DIR"
  fi
fi

BIN_DIR="${BIN_DIR%/}"
[ -n "$BIN_DIR" ] || die "非法的 --bin-dir: '$BIN_DIR'"

if [ -f "$PREFIX/package.json" ]; then
  if command -v node >/dev/null 2>&1; then
    PKG_NAME="$(node -e 'console.log(require(process.argv[1]).name)' "$PREFIX/package.json" 2>/dev/null || true)"
  else
    PKG_NAME="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PREFIX/package.json" | head -n 1)"
  fi
  [ "$PKG_NAME" = "git-lazy-commit" ] || die "$PREFIX 不是 Git Lazy Commit 安装目录（package.json name=$PKG_NAME）"
else
  die "$PREFIX 不是 Git Lazy Commit 安装目录（缺少 package.json）"
fi

info "将卸载 Git Lazy Commit"
info "   安装目录: $PREFIX"
[ -f "$BIN_DIR/git-lzc" ] && info "   启动器:   $BIN_DIR/git-lzc"
[ "$PURGE" -eq 1 ] && info "   全局配置: ~/.config/git-lzc（将删除）"

if [ "$ASSUME_YES" -eq 0 ]; then
  if [ -t 0 ]; then
    printf '确认卸载? [y/N] '
    read -r answer || answer=""
    case "$answer" in
      y|Y|yes|YES) ;;
      *) info "已取消"; exit 0 ;;
    esac
  else
    die "非交互环境请加 --yes"
  fi
fi

if [ -f "$BIN_DIR/git-lzc" ]; then
  if grep -qF 'Git Lazy Commit 启动器' "$BIN_DIR/git-lzc" 2>/dev/null; then
    rm -f "$BIN_DIR/git-lzc"
    info "已删除启动器: $BIN_DIR/git-lzc"
  else
    warn "$BIN_DIR/git-lzc 不是本工具的启动器，已保留"
  fi
fi

rm -rf "$PREFIX"
info "已删除安装目录: $PREFIX"

for rc_file in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  [ -f "$rc_file" ] || continue
  grep -qF '# >>> git-lzc installer >>>' "$rc_file" 2>/dev/null || continue

  tmp_file="${rc_file}.git-lzc.$$"
  if awk '
    /# >>> git-lzc installer >>>/ { skip = 1; next }
    /# <<< git-lzc installer <<</ { skip = 0; next }
    !skip { print }
  ' "$rc_file" > "$tmp_file"; then
    mv "$tmp_file" "$rc_file"
    info "已清理 PATH 配置: $rc_file"
  else
    rm -f "$tmp_file"
    warn "清理 $rc_file 失败，请手动删除 git-lzc installer 标记块"
  fi
done

if [ "$PURGE" -eq 1 ]; then
  rm -rf "$HOME/.config/git-lzc"
  info "已删除全局配置: ~/.config/git-lzc"
fi

info ""
info "✅ 卸载完成"
