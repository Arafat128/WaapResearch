param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BundledNodes = @(
  "C:\Users\User\AppData\Local\OpenAI\Codex\bin\node.exe",
  "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime.previous\dependencies\node\bin\node.exe"
)
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($NodeCommand) {
  $NodeExe = $NodeCommand.Source
} else {
  $NodeExe = $BundledNodes | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $NodeExe) {
    Write-Error "Node.js was not found. Install Node.js LTS from https://nodejs.org/ or add node.exe to your PATH."
  }
}

$NextBin = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"

if (-not (Test-Path -LiteralPath $NextBin)) {
  Write-Error "Next.js dependencies are missing. Run pnpm install first."
}

Set-Location $ProjectRoot
$NodeDir = Split-Path -Parent $NodeExe
$env:Path = "$NodeDir;$env:Path"
& $NodeExe $NextBin dev --webpack -p $Port
