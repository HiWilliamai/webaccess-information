$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$outputDir = Join-Path $root "output\automation"
$logPath = Join-Path $outputDir "theinformation-scheduled-run.log"
$dailyScript = Join-Path $root "scripts\run-theinformation-daily.ps1"
$publishScript = Join-Path $root "scripts\publish-theinformation-brief-to-lark.ps1"
$latestJsonPath = Join-Path $outputDir "theinformation-latest.json"
$briefJsonPath = Join-Path $outputDir "theinformation-brief.json"
$briefTextPath = Join-Path $outputDir "theinformation-brief.txt"
$briefHtmlPath = Join-Path $outputDir "theinformation-brief.html"
$larkStatePath = Join-Path $outputDir "theinformation-lark-publish-state.json"
$publishToLark = $true

if ($env:THE_INFORMATION_LARK_PUBLISH_ENABLED -eq "false") {
  $publishToLark = $false
}

if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Scheduled run started." | Out-File -FilePath $logPath -Encoding utf8 -Append

try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $dailyScript -OutputDir $outputDir 2>&1 | Out-File -FilePath $logPath -Encoding utf8 -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Daily script exited with code $LASTEXITCODE"
  }

  if (!(Test-Path $briefTextPath)) {
    throw "Automation brief text output not found at $briefTextPath"
  }

  if (!(Test-Path $briefHtmlPath)) {
    throw "Automation brief HTML output not found at $briefHtmlPath"
  }

  if ($publishToLark) {
    if (!(Test-Path $briefJsonPath)) {
      throw "Automation brief JSON output not found at $briefJsonPath"
    }

    if (!(Test-Path $latestJsonPath)) {
      throw "Automation latest JSON output not found at $latestJsonPath"
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File $publishScript `
      -LatestJsonPath $latestJsonPath `
      -BriefJsonPath $briefJsonPath `
      -BriefTextPath $briefTextPath `
      -StatePath $larkStatePath 2>&1 | Out-File -FilePath $logPath -Encoding utf8 -Append

    if ($LASTEXITCODE -ne 0) {
      throw "Lark publish script exited with code $LASTEXITCODE"
    }
  }

  $doneAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$doneAt] Scheduled run completed successfully." | Out-File -FilePath $logPath -Encoding utf8 -Append
} catch {
  $failedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$failedAt] Scheduled run failed: $($_.Exception.Message)" | Out-File -FilePath $logPath -Encoding utf8 -Append
  throw
}
