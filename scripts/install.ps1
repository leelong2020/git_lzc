# Git Lazy Commit — 离线安装脚本（Windows PowerShell）
#
# 用法（在解压后的目录中执行）:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#
# 参数:
#   -Prefix DIR   安装目录（默认: %LOCALAPPDATA%\Programs\git-lzc）
#   -NoPath       不把安装目录加入用户 PATH
#   -Uninstall    卸载
#   -Purge        卸载时同时删除全局配置 %USERPROFILE%\.config\git-lzc
#   -Yes          卸载时跳过确认
#
# 运行要求: Node.js >= 16、Git；无需联网。

[CmdletBinding()]
param(
    [string]$Prefix = (Join-Path $env:LOCALAPPDATA 'Programs\git-lzc'),
    [switch]$NoPath,
    [switch]$Uninstall,
    [switch]$Purge,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'

# 若从安装目录内执行 -Uninstall，默认卸载当前目录，无需重复传 -Prefix
if ($Uninstall -and -not $PSBoundParameters.ContainsKey('Prefix')) {
    $localPackage = Join-Path $PSScriptRoot 'package.json'
    $localEntry = Join-Path $PSScriptRoot 'bin\lzc.js'
    if ((Test-Path $localPackage) -and (Test-Path $localEntry)) {
        $Prefix = $PSScriptRoot
    }
}

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host "WARN: $Message" -ForegroundColor Yellow }

function Get-UserPath {
    $value = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ([string]::IsNullOrWhiteSpace($value)) { return @() }
    return @($value -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

function Set-UserPath([string[]]$Parts) {
    [Environment]::SetEnvironmentVariable('Path', ($Parts -join ';'), 'User')
}

function Test-PathEntry([string[]]$Parts, [string]$Entry) {
    $normalized = $Entry.TrimEnd([char]'\')
    foreach ($part in $Parts) {
        if ($part.TrimEnd([char]'\') -ieq $normalized) { return $true }
    }
    return $false
}

function Get-AppVersion([string]$Directory) {
    $packageJson = Join-Path $Directory 'package.json'
    if (-not (Test-Path $packageJson)) { return $null }
    try {
        return (Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json).version
    } catch {
        return $null
    }
}

$Prefix = [System.IO.Path]::GetFullPath($Prefix)
$Prefix = $Prefix.TrimEnd([char]'\')
if ([string]::IsNullOrWhiteSpace($Prefix) -or $Prefix -match '^[A-Za-z]:$') {
    throw "拒绝安装到危险路径: '$Prefix'"
}
$cmdPath = Join-Path $Prefix 'git-lzc.cmd'

if ($Uninstall) {
    if (-not (Test-Path $Prefix)) { throw "安装目录不存在: $Prefix" }

    $packageJson = Join-Path $Prefix 'package.json'
    if (-not (Test-Path $packageJson)) { throw "$Prefix 不是 Git Lazy Commit 安装目录（缺少 package.json）" }

    $package = Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -ne 'git-lazy-commit') {
        throw "$Prefix 不是 Git Lazy Commit 安装目录（package.json name=$($package.name)）"
    }

    Write-Info "将卸载 Git Lazy Commit $($package.version)"
    Write-Info "   安装目录: $Prefix"
    if ($Purge) { Write-Info "   全局配置: $env:USERPROFILE\.config\git-lzc（将删除）" }

    if (-not $Yes) {
        $answer = Read-Host '确认卸载? [y/N]'
        if ($answer -notmatch '^(y|yes)$') {
            Write-Info '已取消'
            return
        }
    }

    if (Test-Path $cmdPath) {
        Remove-Item -LiteralPath $cmdPath -Force
        Write-Info "已删除启动器: $cmdPath"
    }

    Remove-Item -LiteralPath $Prefix -Recurse -Force
    Write-Info "已删除安装目录: $Prefix"

    $parts = Get-UserPath
    $remaining = @($parts | Where-Object { $_.TrimEnd([char]'\') -ine $Prefix })
    if ($remaining.Count -ne $parts.Count) {
        Set-UserPath $remaining
        Write-Info '已从用户 PATH 移除安装目录'
    }
    $env:Path = (@($env:Path -split ';' | Where-Object { $_ -and $_.TrimEnd([char]'\') -ine $Prefix }) -join ';')

    if ($Purge) {
        $configDir = Join-Path $env:USERPROFILE '.config\git-lzc'
        if (Test-Path $configDir) {
            Remove-Item -LiteralPath $configDir -Recurse -Force
            Write-Info "已删除全局配置: $configDir"
        }
    }

    Write-Info ''
    Write-Info 'Git Lazy Commit 卸载完成'
    return
}

# --- 安装 -------------------------------------------------------------------

$sourceApp = Join-Path $PSScriptRoot 'app'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw '未找到 node。请先安装 Node.js >= 16（可离线安装），并确保 node 在 PATH 中。'
}

$nodeVersion = (& node -p 'process.versions.node').Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 16) {
    throw "Node.js 版本过低（当前 $nodeVersion），需要 >= 16。"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Warn '未找到 git，安装后需先安装 Git 才能使用本工具'
}

foreach ($required in @('bin\lzc.js', 'dist\index.js', 'node_modules')) {
    if (-not (Test-Path (Join-Path $sourceApp $required))) {
        throw "安装包不完整: 未找到 app\$required（请确认使用完整离线包）"
    }
}

$version = Get-AppVersion $sourceApp
if (-not $version) { throw '安装包不完整: 无法读取 app\package.json' }

$oldVersion = Get-AppVersion $Prefix
if ($oldVersion) {
    Write-Info "检测到已安装版本: $oldVersion，将升级到 $version"
} else {
    Write-Info "准备安装 Git Lazy Commit $version"
}
Write-Info "   安装目录: $Prefix"
Write-Info ''

$parent = Split-Path -Parent $Prefix
New-Item -ItemType Directory -Force -Path $parent | Out-Null

$staging = Join-Path $parent ('.git-lzc-new-' + [Guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $sourceApp -Destination $staging -Recurse -Force

# 把安装脚本一起装上，便于以后原地卸载
$installerSource = Join-Path $PSScriptRoot 'install.ps1'
if (Test-Path $installerSource) {
    Copy-Item -LiteralPath $installerSource -Destination (Join-Path $staging 'install.ps1') -Force
}

Write-Info '自检安装包 ...'
$checkOutput = & node (Join-Path $staging 'bin\lzc.js') --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    throw "安装包自检失败: $checkOutput"
}
Write-Info "   自检通过: $checkOutput"

$backup = $null
if (Test-Path $Prefix) {
    $backup = Join-Path $parent ('.git-lzc-old-' + [Guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $Prefix -Destination $backup -Force
}

try {
    Move-Item -LiteralPath $staging -Destination $Prefix -Force
} catch {
    if ($backup -and (Test-Path $backup)) {
        Move-Item -LiteralPath $backup -Destination $Prefix -Force
    }
    throw "写入安装目录失败: $Prefix（请检查目录权限）"
}
if ($backup -and (Test-Path $backup)) {
    Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
}

# 启动器内容仅含 ASCII，避免 cmd.exe 代码页问题
$launcher = "@echo off`r`nnode `"%~dp0bin\lzc.js`" %*`r`n"
[System.IO.File]::WriteAllText($cmdPath, $launcher, [System.Text.Encoding]::ASCII)

# --- PATH 配置 --------------------------------------------------------------

if (-not $NoPath) {
    $parts = Get-UserPath
    if (Test-PathEntry $parts $Prefix) {
        Write-Info '用户 PATH 中已包含安装目录'
    } else {
        Set-UserPath (@($parts) + $Prefix)
        Write-Info '已将安装目录加入用户 PATH（新终端生效）'
    }
    if (-not (Test-PathEntry @($env:Path -split ';') $Prefix)) {
        $env:Path = "$Prefix;$env:Path"
    }

    $resolved = Get-Command git-lzc -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-Warn "当前窗口尚未识别 git-lzc，请打开新的终端后重试"
    }
}

# --- 完成 -------------------------------------------------------------------

Write-Info ''
Write-Info "Git Lazy Commit $version 安装完成"
Write-Info "   程序目录: $Prefix"
Write-Info "   执行命令: $cmdPath"
Write-Info "   全局配置: $env:USERPROFILE\.config\git-lzc\lzc.json5（首次运行会提示创建）"
Write-Info "   示例配置: $(Join-Path $Prefix '.lzc.example.json5')"
Write-Info ''
Write-Info '开始使用:'
Write-Info '   git add .'
Write-Info '   git-lzc'
Write-Info ''
Write-Info "卸载: powershell -ExecutionPolicy Bypass -File `"$(Join-Path $Prefix 'install.ps1')`" -Uninstall"
