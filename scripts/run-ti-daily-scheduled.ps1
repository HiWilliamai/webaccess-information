$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$outputDir = Join-Path $root "output\automation"
$logPath = Join-Path $outputDir "theinformation-scheduled-run.log"
$dailyScript = Join-Path $root "scripts\run-theinformation-daily.ps1"
$briefTextPath = Join-Path $outputDir "theinformation-brief.txt"
$briefHtmlPath = Join-Path $outputDir "theinformation-brief.html"

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

  $doneAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$doneAt] Scheduled run completed successfully." | Out-File -FilePath $logPath -Encoding utf8 -Append
} catch {
  $failedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$failedAt] Scheduled run failed: $($_.Exception.Message)" | Out-File -FilePath $logPath -Encoding utf8 -Append
  throw
}
