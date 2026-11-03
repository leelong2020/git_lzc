#!/usr/bin/env bash
#
# Git Lazy Commit — 离线分发包构建脚本
#
# 生成一个自包含的压缩包：包含已编译的 dist、CLI 入口、文档，以及全部生产依赖。
# 客户端解压后无需访问 npm registry，也不需要联网安装依赖。
#
# 用法:
#   bash scripts/build-offline-package.sh [选项]
#
# 选项:
#   --output-dir DIR   输出目录（默认: <项目根>/release）
#   --name NAME        分发包名称（默认: git-lzc-<version>-offline）
#   --skip-tests       跳过单元测试
#   --skip-build       跳过 TypeScript 编译（要求 dist/ 已存在）
#   --no-verify        跳过打包前的临时安装自检
#   -h, --help         显示帮助
#
# 依赖: bash、node（>= 16）、git、tar；zip 可选（存在时额外生成 zip）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT/release"
SKIP_TESTS=0
SKIP_BUILD=0
VERIFY=1
BUNDLE_NAME=""
STAGE_ROOT=""

cleanup() {
  if [ -n "$STAGE_ROOT" ] && [ -d "$STAGE_ROOT" ]; then
    rm -rf "$STAGE_ROOT"
  fi
}
trap cleanup EXIT

info() { printf '%s\n' "$*"; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

usage() {
  awk 'NR > 1 && /^set -euo pipefail/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      [ "$#" -ge 2 ] || die "--output-dir 需要参数"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --output-dir=*)
      OUTPUT_DIR="${1#*=}"
      shift
      ;;
    --name)
      [ "$#" -ge 2 ] || die "--name 需要参数"
      BUNDLE_NAME="$2"
      shift 2
      ;;
    --name=*)
      BUNDLE_NAME="${1#*=}"
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --no-verify)
      VERIFY=0
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

# --- 环境检查 ---------------------------------------------------------------

command -v node >/dev/null 2>&1 || die "未找到 node，请安装 Node.js >= 16"
command -v tar >/dev/null 2>&1 || die "未找到 tar"

NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
[ "$NODE_MAJOR" -ge 16 ] || die "Node.js 版本过低（当前 $NODE_VERSION），需要 >= 16"

VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
[ -n "$BUNDLE_NAME" ] || BUNDLE_NAME="git-lzc-${VERSION}-offline"

info "📦 Git Lazy Commit 离线打包"
info "   版本: $VERSION"
info "   项目: $ROOT"
info ""

# --- 编译与测试 -------------------------------------------------------------

if [ "$SKIP_BUILD" -eq 0 ]; then
  TSC="$ROOT/node_modules/typescript/bin/tsc"
  [ -f "$TSC" ] || die "未找到 TypeScript（node_modules/typescript），请先执行 npm install"
  info "▶ 编译 TypeScript ..."
  rm -rf "$ROOT/dist"
  (cd "$ROOT" && node "$TSC" -p tsconfig.json)
else
  info "▶ 跳过编译（--skip-build）"
fi

[ -f "$ROOT/dist/index.js" ] || die "dist/index.js 不存在，请先执行 npm run build"

if [ "$SKIP_TESTS" -eq 0 ]; then
  JEST="$ROOT/node_modules/jest/bin/jest.js"
  if [ -f "$JEST" ]; then
    info "▶ 运行单元测试 ..."
    (cd "$ROOT" && node "$JEST" --runInBand)
  else
    info "⚠️  未找到 jest，跳过单元测试"
  fi
else
  info "▶ 跳过测试（--skip-tests）"
fi

# --- 组装分发包 -------------------------------------------------------------

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
STAGE_ROOT="$(mktemp -d "$OUTPUT_DIR/.stage.XXXXXX")"
BUNDLE_DIR="$STAGE_ROOT/$BUNDLE_NAME"
APP_DIR="$BUNDLE_DIR/app"
mkdir -p "$APP_DIR"

info ""
info "▶ 收集程序文件 ..."
cp -R "$ROOT/dist" "$APP_DIR/dist"
cp -R "$ROOT/bin" "$APP_DIR/bin"
for file in package.json README.md README_EN.md .lzc.example.json5; do
  [ -f "$ROOT/$file" ] && cp "$ROOT/$file" "$APP_DIR/$file"
done
chmod +x "$APP_DIR/bin/lzc.js"

info "▶ 内置生产依赖（离线运行，无需 npm install）..."
node "$ROOT/scripts/vendor-prod-deps.js" "$ROOT" "$APP_DIR"

info "▶ 复制客户端安装脚本 ..."
for file in install.sh uninstall.sh install.ps1 OFFLINE-README.md; do
  [ -f "$ROOT/scripts/$file" ] || die "缺少脚本: scripts/$file"
  cp "$ROOT/scripts/$file" "$BUNDLE_DIR/$file"
done
chmod +x "$BUNDLE_DIR/install.sh" "$BUNDLE_DIR/uninstall.sh"

GIT_COMMIT="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || true)"
APP_SIZE="$(du -sh "$APP_DIR" | cut -f1)"

VERSION="$VERSION" \
BUNDLE_NAME="$BUNDLE_NAME" \
GIT_COMMIT="$GIT_COMMIT" \
APP_SIZE="$APP_SIZE" \
BUNDLE_DIR="$BUNDLE_DIR" \
node <<'NODE'
const fs = require('fs');
const path = require('path');

const {
  VERSION,
  BUNDLE_NAME,
  GIT_COMMIT,
  APP_SIZE,
  BUNDLE_DIR
} = process.env;

const manifest = {
  name: 'git-lazy-commit',
  version: VERSION,
  bundle: BUNDLE_NAME,
  entry: 'app/bin/lzc.js',
  node: '>=16.0.0',
  platform: 'any (仅依赖 Node.js 与 Git)',
  gitCommit: GIT_COMMIT || null,
  builtAt: new Date().toISOString(),
  appSize: APP_SIZE || null
};

fs.writeFileSync(
  path.join(BUNDLE_DIR, 'offline-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
NODE

# --- 自检 -------------------------------------------------------------------

if [ "$VERIFY" -eq 1 ]; then
  info "▶ 自检：临时目录离线安装并运行 ..."
  VERIFY_ROOT="$(mktemp -d)"
  if ! "$BUNDLE_DIR/install.sh" \
      --prefix "$VERIFY_ROOT/app" \
      --bin-dir "$VERIFY_ROOT/bin" \
      --yes --no-path >"$VERIFY_ROOT/install.log" 2>&1; then
    cat "$VERIFY_ROOT/install.log" >&2
    rm -rf "$VERIFY_ROOT"
    die "离线安装自检失败"
  fi
  if ! INSTALLED_VERSION="$("$VERIFY_ROOT/bin/git-lzc" --version 2>&1)"; then
    cat "$VERIFY_ROOT/install.log" >&2
    rm -rf "$VERIFY_ROOT"
    die "安装后运行 git-lzc --version 失败"
  fi
  "$VERIFY_ROOT/bin/git-lzc" --help >/dev/null 2>&1 || {
    rm -rf "$VERIFY_ROOT"
    die "安装后运行 git-lzc --help 失败"
  }
  rm -rf "$VERIFY_ROOT"
  info "   自检通过: $INSTALLED_VERSION"
fi

# --- 生成压缩包 -------------------------------------------------------------

info "▶ 生成压缩包 ..."
TARBALL="$OUTPUT_DIR/$BUNDLE_NAME.tar.gz"
COPYFILE_DISABLE=1 tar --exclude='.DS_Store' -czf "$TARBALL" -C "$STAGE_ROOT" "$BUNDLE_NAME"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$BUNDLE_NAME.tar.gz" > "$BUNDLE_NAME.tar.gz.sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && shasum -a 256 "$BUNDLE_NAME.tar.gz" > "$BUNDLE_NAME.tar.gz.sha256")
fi

ZIP_FILE=""
if command -v zip >/dev/null 2>&1; then
  ZIP_FILE="$OUTPUT_DIR/$BUNDLE_NAME.zip"
  (cd "$STAGE_ROOT" && zip -qr "$ZIP_FILE" "$BUNDLE_NAME" -x '*.DS_Store')
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && sha256sum "$BUNDLE_NAME.zip" > "$BUNDLE_NAME.zip.sha256")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && shasum -a 256 "$BUNDLE_NAME.zip" > "$BUNDLE_NAME.zip.sha256")
  fi
fi

info ""
info "✅ 离线分发包已生成"
info "   程序体积: $APP_SIZE"
info "   压缩包:   $TARBALL ($(du -h "$TARBALL" | cut -f1))"
[ -n "$ZIP_FILE" ] && info "   ZIP:      $ZIP_FILE"
[ -f "$TARBALL.sha256" ] && info "   SHA256:   $(cut -d' ' -f1 "$TARBALL.sha256")"
info ""
info "客户端安装（Linux / macOS）:"
info "   tar -xzf $(basename "$TARBALL")"
info "   cd $BUNDLE_NAME && ./install.sh"
info ""
info "客户端安装（Windows PowerShell）:"
info "   tar -xzf $(basename "$TARBALL")"
info "   cd $BUNDLE_NAME"
info "   powershell -ExecutionPolicy Bypass -File .\\install.ps1"
