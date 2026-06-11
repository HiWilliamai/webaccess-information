$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$toolsDir = Join-Path $root ".tools"
$targetPath = Join-Path $toolsDir "codex.exe"

if (!(Test-Path $toolsDir)) {
  New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

function Get-CodexCliVersion {
  param(
    [string]$Path
  )

  try {
    $versionText = (& $Path --version 2>$null | Select-Object -First 1)
    if ($versionText -match "(\d+)\.(\d+)\.(\d+)(?:-alpha\.(\d+))?") {
      $alphaVersion = if ($Matches[4]) { [int]$Matches[4] } else { 9999 }
      return [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], $alphaVersion)
    }
  } catch {
  }

  return $null
}

$candidatePaths = @()

$configPath = Join-Path $env:USERPROFILE ".codex\config.toml"
if (Test-Path $configPath) {
  $configCliPathLine = Select-String -LiteralPath $configPath -Pattern '^\s*CODEX_CLI_PATH\s*=\s*[''"](.+?)[''"]' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($configCliPathLine -and $configCliPathLine.Matches.Count -gt 0) {
    $candidatePaths += $configCliPathLine.Matches[0].Groups[1].Value
  }
}

$localCodexBinRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
if (Test-Path $localCodexBinRoot) {
  $localCodexBinCandidates =
    Get-ChildItem -Path $localCodexBinRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName "codex.exe" }
  $candidatePaths += $localCodexBinCandidates
}

try {
  $command = Get-Command codex -ErrorAction Stop
  if ($command.Source) {
    $candidatePaths += $command.Source
  }
} catch {
}

if (Test-Path $env:LOCALAPPDATA) {
  $localPackageCandidates =
    Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Packages") -Directory -Filter "OpenAI.Codex_*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName "LocalCache\Local\OpenAI\Codex\bin\codex.exe" }
  $candidatePaths += $localPackageCandidates
}

$candidatePaths += @(
  (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\codex.exe"),
  (Join-Path $env:USERPROFILE ".codex\.sandbox-bin\codex.exe"),
  $targetPath
)

$windowsAppsRoot = "C:\Program Files\WindowsApps"
if (Test-Path $windowsAppsRoot) {
  $windowsAppsCandidates =
    Get-ChildItem -Path $windowsAppsRoot -Directory -Filter "OpenAI.Codex_*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "app\resources\codex.exe" }
  $candidatePaths += $windowsAppsCandidates
}

$sourceCandidate =
  $candidatePaths |
    Select-Object -Unique |
    Where-Object { $_ -and (Test-Path $_) } |
    ForEach-Object {
      [PSCustomObject]@{
        Path = $_
        Version = Get-CodexCliVersion -Path $_
      }
    } |
    Where-Object { $null -ne $_.Version } |
    Sort-Object Version -Descending |
    Select-Object -First 1

$sourcePath = if ($sourceCandidate) { $sourceCandidate.Path } else { $null }

if (!(Test-Path $targetPath)) {
  if (!$sourcePath) {
    throw "Could not locate Codex CLI from any known path."
  }
  Copy-Item $sourcePath $targetPath -Force
} elseif ($sourcePath -and ((Resolve-Path $sourcePath).Path -ine (Resolve-Path $targetPath).Path)) {
  $sourceInfo = Get-Item $sourcePath
  $targetInfo = Get-Item $targetPath
  $shouldCopy = ($sourceInfo.Length -ne $targetInfo.Length) -or ($sourceInfo.LastWriteTimeUtc -gt $targetInfo.LastWriteTimeUtc)
  if ($shouldCopy) {
    Copy-Item $sourcePath $targetPath -Force
  }
}

Write-Output $targetPath
