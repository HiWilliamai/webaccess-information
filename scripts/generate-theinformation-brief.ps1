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

$promptText = Get-Content -Raw $promptPath
$relativeInputJsonPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputJsonPath
$relativeInputTextPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputTextPath
$relativeInputHtmlPath = Get-WorkspaceRelativePath -BasePath $root -TargetPath $InputHtmlPath
$promptText = $promptText.Replace("output/theinformation-latest.json", $relativeInputJsonPath)
$promptText = $promptText.Replace("output/theinformation-latest.txt", $relativeInputTextPath)
$promptText = $promptText.Replace("output/theinformation-latest.html", $relativeInputHtmlPath)
$tempLogPath = "$briefLogPath.tmp"
if (Test-Path $tempLogPath) {
  Remove-Item $tempLogPath -Force
}

foreach ($outputPath in @($BriefJsonPath, $BriefTextPath, $BriefHtmlPath)) {
  if (Test-Path $outputPath) {
    Remove-Item $outputPath -Force
  }
}

$previousErrorActionPreference = $ErrorActionPreference
$allExecutionOutput = @()
$allExecutionOutput += "Using Codex CLI at $codexPath ($codexVersion)."
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
  $isRetryableModelGateError = $outputText -match "requires a newer version of Codex"

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

node (Join-Path $root "scripts\render-theinformation-brief.mjs") --input $BriefJsonPath --text-output $BriefTextPath --html-output $BriefHtmlPath | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Brief renderer failed for $BriefJsonPath"
}

Write-Output "Saved brief JSON to $BriefJsonPath"
Write-Output "Saved brief text to $BriefTextPath"
Write-Output "Saved brief HTML to $BriefHtmlPath"
Write-Output "Saved brief log to $BriefLogPath"
