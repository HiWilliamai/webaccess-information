[CmdletBinding()]
param(
  [string]$InputJsonPath = "D:\codex\webaccess\output\manual\theinformation-latest.json",
  [string]$InputTextPath = "D:\codex\webaccess\output\manual\theinformation-latest.txt",
  [string]$InputHtmlPath = "D:\codex\webaccess\output\manual\theinformation-latest.html",
  [string]$BriefJsonPath = "D:\codex\webaccess\output\manual\theinformation-brief.json",
  [string]$BriefTextPath = "D:\codex\webaccess\output\manual\theinformation-brief.txt",
  [string]$BriefHtmlPath = "D:\codex\webaccess\output\manual\theinformation-brief.html",
  [string]$BriefLogPath = "D:\codex\webaccess\output\manual\theinformation-brief-run.log",
  [string]$BriefModel = "gpt-5.5",
  [int]$MaxBriefAttempts = 2
)

$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"
$promptPath = Join-Path $root "prompts\ti-daily-brief-prompt.txt"
$schemaPath = Join-Path $root "schemas\ti-daily-brief.schema.json"

function Get-WorkspaceRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $resolvedBasePath = (Resolve-Path $BasePath).Path.TrimEnd('\')
  $resolvedTargetPath = (Resolve-Path $TargetPath).Path

  if ($resolvedTargetPath.StartsWith($resolvedBasePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $resolvedTargetPath.Substring($resolvedBasePath.Length).TrimStart('\').Replace('\', '/')
  }

  return $resolvedTargetPath.Replace('\', '/')
}

function Test-LocalTcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMilliseconds = 1000
  )

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.BeginConnect($HostName, $Port, $null, $null)
    if (!$connect.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
      return $false
    }

    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Enable-CodexProxyIfAvailable {
  if ($env:THE_INFORMATION_CODEX_PROXY_DISABLED -eq "true") {
    return "Codex proxy auto-detection disabled by THE_INFORMATION_CODEX_PROXY_DISABLED."
  }

  if (![string]::IsNullOrWhiteSpace($env:HTTP_PROXY) -or ![string]::IsNullOrWhiteSpace($env:HTTPS_PROXY) -or ![string]::IsNullOrWhiteSpace($env:ALL_PROXY)) {
    return "Codex proxy environment already configured."
  }

  $proxyUrl = $env:THE_INFORMATION_CODEX_PROXY_URL
  if ([string]::IsNullOrWhiteSpace($proxyUrl)) {
    $proxyUrl = "http://127.0.0.1:7897"
  }

  try {
    $proxyUri = [System.Uri]$proxyUrl
  } catch {
    return "Skipping Codex proxy auto-detection because THE_INFORMATION_CODEX_PROXY_URL is invalid: $proxyUrl"
  }

  if ($proxyUri.Port -le 0) {
    return "Skipping Codex proxy auto-detection because proxy URL has no port: $proxyUrl"
  }

  if (!(Test-LocalTcpPort -HostName $proxyUri.Host -Port $proxyUri.Port)) {
    return "No local Codex proxy detected at $proxyUrl."
  }

  $env:HTTP_PROXY = $proxyUrl
  $env:HTTPS_PROXY = $proxyUrl
  $env:ALL_PROXY = $proxyUrl
  return "Using local Codex proxy at $proxyUrl."
}

if (!(Test-Path $InputJsonPath)) {
  throw "Latest JSON report not found at $InputJsonPath"
}

if (!(Test-Path $InputTextPath)) {
  throw "Latest text report not found at $InputTextPath"
}

if (!(Test-Path $InputHtmlPath)) {
  throw "Latest HTML report not found at $InputHtmlPath"
}

if (!(Test-Path $promptPath)) {
  throw "Prompt file not found at $promptPath"
}

if (!(Test-Path $schemaPath)) {
  throw "Schema file not found at $schemaPath"
}

if (!$PSBoundParameters.ContainsKey("BriefModel") -and ![string]::IsNullOrWhiteSpace($env:THE_INFORMATION_BRIEF_MODEL)) {
  $BriefModel = $env:THE_INFORMATION_BRIEF_MODEL
}

if (!$PSBoundParameters.ContainsKey("MaxBriefAttempts") -and ![string]::IsNullOrWhiteSpace($env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS)) {
  $parsedMaxBriefAttempts = 0
  if (![int]::TryParse($env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS, [ref]$parsedMaxBriefAttempts)) {
    throw "THE_INFORMATION_BRIEF_MAX_ATTEMPTS must be an integer"
  }
  $MaxBriefAttempts = $parsedMaxBriefAttempts
}

if ($MaxBriefAttempts -lt 1) {
  throw "MaxBriefAttempts must be at least 1"
}

$codexPath = powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\ensure-codex-cli.ps1")
$codexPath = ($codexPath | Select-Object -Last 1).Trim()

if (!(Test-Path $codexPath)) {
  throw "Local Codex CLI not available at $codexPath"
}

$codexVersion = & $codexPath --version
$codexVersion = ($codexVersion | Select-Object -First 1).Trim()
$proxySetupMessage = Enable-CodexProxyIfAvailable

$previousErrorActionPreference = $ErrorActionPreference
$allExecutionOutput = @()
$allExecutionOutput += "Using Codex CLI at $codexPath ($codexVersion)."
$allExecutionOutput += $proxySetupMessage
$allExecutionOutput += "Checking Codex CLI login status before removing previous brief outputs."
$ErrorActionPreference = "Continue"
$loginStatusOutput = & $codexPath login status 2>&1
$loginStatusExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$allExecutionOutput += $loginStatusOutput
$loginStatusText = ($loginStatusOutput | Out-String)

if ($loginStatusExitCode -ne 0 -or $loginStatusText -match "Not logged in|token_invalidated|refresh_token_reused|log in again") {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $BriefLogPath) | Out-Null
  $allExecutionOutput | Out-File -FilePath $BriefLogPath -Encoding utf8
  throw "Codex CLI is not logged in. Run '$codexPath login' or '$codexPath login --device-auth', then rerun the scheduled brief."
}

$promptText = Get-Content -Raw $promptPath
$relativeInputJsonPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputJsonPath
$relativeInputTextPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputTextPath
$relativeInputHtmlPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputHtmlPath
$promptText = $promptText.Replace("output/theinformation-latest.json", $relativeInputJsonPath)
$promptText = $promptText.Replace("output/theinformation-latest.txt", $relativeInputTextPath)
$promptText = $promptText.Replace("output/theinformation-latest.html", $relativeInputHtmlPath)
$latestForTitleManifest = Get-Content -Raw -Encoding UTF8 $InputJsonPath | ConvertFrom-Json
$sourceTitleLines = New-Object System.Collections.Generic.List[string]
foreach ($article in @($latestForTitleManifest.articles)) {
  if ($null -ne $article.title -and ![string]::IsNullOrWhiteSpace([string]$article.title)) {
    $sourceTitleLines.Add("- full: $($article.title)") | Out-Null
  }
}
foreach ($article in @($latestForTitleManifest.partialArticles)) {
  if ($null -ne $article.title -and ![string]::IsNullOrWhiteSpace([string]$article.title)) {
    $sourceTitleLines.Add("- partial: $($article.title)") | Out-Null
  }
}
foreach ($article in @($latestForTitleManifest.blockedArticles)) {
  if ($null -ne $article.title -and ![string]::IsNullOrWhiteSpace([string]$article.title)) {
    $sourceTitleLines.Add("- blocked: $($article.title)") | Out-Null
  }
}
foreach ($article in @($latestForTitleManifest.unprocessedArticles)) {
  $title = $article.title
  if ([string]::IsNullOrWhiteSpace([string]$title)) {
    $title = $article.linkText
  }
  if ($null -ne $title -and ![string]::IsNullOrWhiteSpace([string]$title)) {
    $sourceTitleLines.Add("- unprocessed: $title") | Out-Null
  }
}
if ($sourceTitleLines.Count -gt 0) {
  $promptText += "`n`nMandatory source title manifest:`n"
  $promptText += ($sourceTitleLines.ToArray() -join "`n")
  $promptText += "`n`nYour output title set must match this manifest exactly: do not add titles and do not omit titles.`n"
}
$tempLogPath = "$briefLogPath.tmp"
if (Test-Path $tempLogPath) {
  Remove-Item $tempLogPath -Force
}

foreach ($outputPath in @($BriefJsonPath, $BriefTextPath, $BriefHtmlPath)) {
  if (Test-Path $outputPath) {
    Remove-Item $outputPath -Force
  }
}

$codexExitCode = 1

for ($attempt = 1; $attempt -le $MaxBriefAttempts; $attempt++) {
  if (Test-Path $BriefJsonPath) {
    Remove-Item $BriefJsonPath -Force
  }

  $allExecutionOutput += "Codex brief generation attempt $attempt of $MaxBriefAttempts with model $BriefModel."
  $ErrorActionPreference = "Continue"
  $executionOutput =
    $promptText |
      & $codexPath `
        --dangerously-bypass-approvals-and-sandbox `
        -m $BriefModel `
        -c reasoning_effort='"high"' `
        exec `
        -C $root `
        --skip-git-repo-check `
        --color never `
        --output-schema $schemaPath `
        --output-last-message $BriefJsonPath `
        - 2>&1
  $codexExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference

  $allExecutionOutput += $executionOutput
  $outputText = ($executionOutput | Out-String)
  $isRetryableModelGateError = $outputText -match "requires a newer version of Codex|Selected model is at capacity"

  if ($codexExitCode -eq 0 -or !$isRetryableModelGateError -or $attempt -eq $MaxBriefAttempts) {
    break
  }

  $allExecutionOutput += "Retrying after transient Codex model gate error."
  Start-Sleep -Seconds 15
}

$ErrorActionPreference = $previousErrorActionPreference

$allExecutionOutput | Out-File -FilePath $tempLogPath -Encoding utf8

Move-Item -LiteralPath $tempLogPath -Destination $briefLogPath -Force

if ($codexExitCode -ne 0) {
  throw "Codex brief generation failed with model $BriefModel. See log at $briefLogPath"
}

if (!(Test-Path $BriefJsonPath)) {
  throw "Codex brief generation did not write expected JSON at $BriefJsonPath. See log at $briefLogPath"
}

node (Join-Path $root "scripts\validate-theinformation-brief-against-latest.mjs") --latest $InputJsonPath --brief $BriefJsonPath | Out-File -FilePath $briefLogPath -Encoding utf8 -Append
if ($LASTEXITCODE -ne 0) {
  throw "Codex brief generation produced titles that do not match latest source. See log at $briefLogPath"
}

node (Join-Path $root "scripts\normalize-theinformation-brief-source-fields.mjs") --latest $InputJsonPath --brief $BriefJsonPath --output $BriefJsonPath | Out-File -FilePath $briefLogPath -Encoding utf8 -Append
if ($LASTEXITCODE -ne 0) {
  throw "Brief source field normalization failed for $BriefJsonPath"
}

node (Join-Path $root "scripts\render-theinformation-brief.mjs") --input $BriefJsonPath --text-output $BriefTextPath --html-output $BriefHtmlPath | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Brief renderer failed for $BriefJsonPath"
}

Write-Output "Saved brief JSON to $BriefJsonPath"
Write-Output "Saved brief text to $BriefTextPath"
Write-Output "Saved brief HTML to $BriefHtmlPath"
Write-Output "Saved brief log to $BriefLogPath"
