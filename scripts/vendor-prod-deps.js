#!/usr/bin/env node
/**
 * 将当前 node_modules 中的生产依赖复制到离线包内，使目标机器无需访问
 * npm registry 即可运行。
 *
 * 用法: node scripts/vendor-prod-deps.js <项目根目录> <离线包 app 目录>
 *
 * 说明:
 * - 从 package.json 的 dependencies 出发，按 Node.js 的模块解析规则遍历
 *   实际安装的依赖树，兼容 npm 的扁平/嵌套布局与 pnpm 的软链接布局。
 * - 只跟随 dependencies / optionalDependencies / peerDependencies，不打包 devDependencies。
 * - 复制时解引用符号链接，保持目标机器上无需额外处理软链。
 * - 本机未安装的 optional 依赖会被跳过；非 optional 依赖缺失则报错。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const [, , sourceRootArg, targetAppArg] = process.argv;

if (!sourceRootArg || !targetAppArg) {
  console.error('用法: node scripts/vendor-prod-deps.js <项目根目录> <离线包 app 目录>');
  process.exit(2);
}

const sourceRoot = path.resolve(sourceRootArg);
const targetApp = path.resolve(targetAppArg);
const rootPackagePath = path.join(sourceRoot, 'package.json');
const targetNodeModules = path.join(targetApp, 'node_modules');

if (!fs.existsSync(rootPackagePath)) {
  console.error(`❌ 缺少文件: ${rootPackagePath}`);
  process.exit(1);
}

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

/** 按 Node.js 规则从 fromDir 向上查找 node_modules/<name> */
function resolvePackage(fromDir, name) {
  let current = fromDir;
  while (true) {
    const candidate = path.join(current, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function readPackage(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

const queue = [];
const queued = new Set();
const copied = new Set();
const missingRequired = [];
const missingOptional = [];

function enqueue(name, resolvedPath, destRel) {
  const key = `${resolvedPath}\u0000${destRel}`;
  if (queued.has(key)) {
    return;
  }
  queued.add(key);
  queue.push({ name, resolvedPath, destRel });
}

// 根依赖：安装在项目根 node_modules 下
for (const dependency of Object.keys(rootPackage.dependencies || {})) {
  const resolved = resolvePackage(sourceRoot, dependency);
  if (!resolved) {
    missingRequired.push(dependency);
    continue;
  }
  enqueue(dependency, resolved, `node_modules/${dependency}`);
}

while (queue.length > 0) {
  const item = queue.shift();
  const realSource = fs.realpathSync(item.resolvedPath);

  const copyKey = `${realSource}\u0000${item.destRel}`;
  if (copied.has(copyKey)) {
    continue;
  }
  copied.add(copyKey);

  const destination = path.join(targetApp, item.destRel);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(realSource, destination, {
    recursive: true,
    dereference: true,
    preserveTimestamps: true
  });

  const packageJson = readPackage(realSource);
  const dependencySpecs = new Map();

  for (const dependency of Object.keys(packageJson.dependencies || {})) {
    dependencySpecs.set(dependency, false);
  }
  for (const dependency of Object.keys(packageJson.optionalDependencies || {})) {
    dependencySpecs.set(dependency, true);
  }
  const peerMeta = packageJson.peerDependenciesMeta || {};
  for (const dependency of Object.keys(packageJson.peerDependencies || {})) {
    if (!dependencySpecs.has(dependency)) {
      dependencySpecs.set(dependency, Boolean(peerMeta[dependency] && peerMeta[dependency].optional));
    }
  }

  for (const [dependency, isOptional] of dependencySpecs) {
    const resolved = resolvePackage(realSource, dependency);
    if (!resolved) {
      (isOptional ? missingOptional : missingRequired).push(`${item.name} -> ${dependency}`);
      continue;
    }

    const relativeToRoot = path.relative(sourceRoot, resolved);
    let destRel;

    if (relativeToRoot === path.join('node_modules', dependency)) {
      // 提升到项目根 node_modules 的公共依赖
      destRel = toPosix(relativeToRoot);
    } else if (
      relativeToRoot.startsWith(`node_modules${path.sep}`) &&
      !relativeToRoot.split(path.sep).includes('.pnpm')
    ) {
      // npm 嵌套依赖：保持原有相对路径
      destRel = toPosix(relativeToRoot);
    } else {
      // pnpm store 等布局：复制到引用方自己的 node_modules 下
      destRel = path.posix.join(item.destRel, 'node_modules', dependency);
    }

    enqueue(dependency, resolved, destRel);
  }
}

// 校验 package.json 中声明的直接生产依赖都已就位
for (const dependency of Object.keys(rootPackage.dependencies || {})) {
  const installed = path.join(targetNodeModules, dependency, 'package.json');
  if (!fs.existsSync(installed)) {
    missingRequired.push(dependency);
  }
}

if (missingRequired.length > 0) {
  console.error('❌ 生产依赖不完整，无法生成离线包。');
  console.error(`   缺失: ${[...new Set(missingRequired)].slice(0, 10).join(', ')}`);
  console.error('   请先在可联网环境执行 npm install，再重新打包。');
  process.exit(1);
}

console.log(`已内置 ${copied.size} 个生产依赖包`);
if (missingOptional.length > 0) {
  console.log(`已跳过 ${new Set(missingOptional).size} 个未安装的可选依赖（通常为其他平台专用）`);
}
