[CmdletBinding()]
param(
  [string]$OutputDir = "D:\codex\webaccess\output\manual"
)

$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$jsonPath = Join-Path $OutputDir "theinformation-latest.json"
$textPath = Join-Path $OutputDir "theinformation-latest.txt"
$htmlPath = Join-Path $OutputDir "theinformation-latest.html"
$briefJsonPath = Join-Path $OutputDir "theinformation-brief.json"
$briefTextPath = Join-Path $OutputDir "theinformation-brief.txt"
$briefHtmlPath = Join-Path $OutputDir "theinformation-brief.html"
$briefLogPath = Join-Path $OutputDir "theinformation-brief-run.log"

if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$env:THE_INFORMATION_TIMEZONE = "Asia/Shanghai"
$env:THE_INFORMATION_LOOKBACK_DAYS = "1"
if ((Resolve-Path $OutputDir).Path -ieq (Join-Path $root "output\manual")) {
  $env:THE_INFORMATION_CONSERVATIVE_EARLY_STOP = "true"
  $env:THE_INFORMATION_EARLY_STOP_MIN_COMPLETED_ARTICLES = "10"
  $env:THE_INFORMATION_EARLY_STOP_OLDER_ARTICLE_STREAK = "4"
} else {
  $env:THE_INFORMATION_CONSERVATIVE_EARLY_STOP = "false"
}
powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\start-chrome-debug.ps1")
node (Join-Path $root "scripts\fetch-theinformation.mjs") --output $jsonPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Fetch step failed while writing $jsonPath"
}

node (Join-Path $root "scripts\render-theinformation-report.mjs") --input $jsonPath --text-output $textPath --html-output $htmlPath | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Raw report renderer failed for $jsonPath"
}

powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\generate-theinformation-brief.ps1") `
  -InputJsonPath $jsonPath `
  -InputTextPath $textPath `
  -InputHtmlPath $htmlPath `
  -BriefJsonPath $briefJsonPath `
  -BriefTextPath $briefTextPath `
  -BriefHtmlPath $briefHtmlPath `
  -BriefLogPath $briefLogPath
if ($LASTEXITCODE -ne 0) {
  throw "Brief generation failed while writing $briefJsonPath"
}

Write-Output "Saved latest fetch to $jsonPath"
Write-Output "Saved text report to $textPath"
Write-Output "Saved HTML report to $htmlPath"
Write-Output "Saved brief JSON to $briefJsonPath"
Write-Output "Saved brief text to $briefTextPath"
Write-Output "Saved brief HTML to $briefHtmlPath"
