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

if ([string]::IsNullOrWhiteSpace($env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS)) {
  $env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS = "3"
}

if ([string]::IsNullOrWhiteSpace($env:THE_INFORMATION_CLOUDFLARE_CLEAR_TIMEOUT_MS)) {
  $env:THE_INFORMATION_CLOUDFLARE_CLEAR_TIMEOUT_MS = "480000"
}

if ([string]::IsNullOrWhiteSpace($env:THE_INFORMATION_FETCH_MAX_ATTEMPTS)) {
  $env:THE_INFORMATION_FETCH_MAX_ATTEMPTS = "3"
}

if ([string]::IsNullOrWhiteSpace($env:THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS)) {
  $env:THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS = "60"
}

$fetchMaxAttempts = 0
if (![int]::TryParse($env:THE_INFORMATION_FETCH_MAX_ATTEMPTS, [ref]$fetchMaxAttempts) -or $fetchMaxAttempts -lt 1) {
  throw "THE_INFORMATION_FETCH_MAX_ATTEMPTS must be a positive integer"
}

$fetchRetryDelaySeconds = 0
if (![int]::TryParse($env:THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS, [ref]$fetchRetryDelaySeconds) -or $fetchRetryDelaySeconds -lt 0) {
  throw "THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS must be a non-negative integer"
}

if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Scheduled run started." | Out-File -FilePath $logPath -Encoding utf8 -Append

try {
  $dailySucceeded = $false
  for ($dailyAttempt = 1; $dailyAttempt -le $fetchMaxAttempts; $dailyAttempt++) {
    $attemptStartedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$attemptStartedAt] Daily run attempt $dailyAttempt of $fetchMaxAttempts started." | Out-File -FilePath $logPath -Encoding utf8 -Append

    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $dailyOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $dailyScript -OutputDir $outputDir 2>&1
      $dailyExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    $dailyOutput | Out-File -FilePath $logPath -Encoding utf8 -Append

    if ($dailyExitCode -eq 0) {
      $dailySucceeded = $true
      break
    }

    $dailyOutputText = ($dailyOutput | Out-String)
    $isRetryableCloudflareFailure = $dailyOutputText -match "retryable_cloudflare_challenge"
    if (!$isRetryableCloudflareFailure -or $dailyAttempt -eq $fetchMaxAttempts) {
      throw "Daily script exited with code $dailyExitCode"
    }

    $currentRetryDelaySeconds = $fetchRetryDelaySeconds
    if ($dailyAttempt -eq 2) {
      $currentRetryDelaySeconds = 120
    }

    $retryAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$retryAt] Daily run attempt $dailyAttempt hit retryable Cloudflare challenge; retrying in $currentRetryDelaySeconds seconds." | Out-File -FilePath $logPath -Encoding utf8 -Append
    if ($currentRetryDelaySeconds -gt 0) {
      Start-Sleep -Seconds $currentRetryDelaySeconds
    }
  }

  if (!$dailySucceeded) {
    throw "Daily script did not complete successfully after $fetchMaxAttempts attempt(s)"
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
