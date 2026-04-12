$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$toolsDir = Join-Path $root ".tools"
$targetPath = Join-Path $toolsDir "codex.exe"

if (!(Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

$candidatePaths = @()

try {
  $command = Get-Command codex -ErrorAction Stop
  if ($command.Source) {
    $candidatePaths += $command.Source
  }
} catch {
}

$candidatePaths += @(
  (Join-Path $env:USERPROFILE ".codex\.sandbox-bin\codex.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\codex.exe")
)

$windowsAppsRoot = "C:\Program Files\WindowsApps"
if (Test-Path $windowsAppsRoot) {
  $windowsAppsCandidates =
    Get-ChildItem -Path $windowsAppsRoot -Directory -Filter "OpenAI.Codex_*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "app\resources\codex.exe" }
  $candidatePaths += $windowsAppsCandidates
}

$sourcePath = $candidatePaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (!(Test-Path $targetPath)) {
  if (!$sourcePath) {
    throw "Could not locate Codex CLI from any known path."
  }
  Copy-Item $sourcePath $targetPath -Force
} elseif ($sourcePath) {
  $sourceInfo = Get-Item $sourcePath
  $targetInfo = Get-Item $targetPath
  $shouldCopy = ($sourceInfo.Length -ne $targetInfo.Length) -or ($sourceInfo.LastWriteTimeUtc -gt $targetInfo.LastWriteTimeUtc)
  if ($shouldCopy) {
    Copy-Item $sourcePath $targetPath -Force
  }
}

Write-Output $targetPath
