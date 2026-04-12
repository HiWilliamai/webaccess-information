[CmdletBinding()]
param(
  [string]$InputJsonPath = "D:\codex\webaccess\output\manual\theinformation-latest.json",
  [string]$InputTextPath = "D:\codex\webaccess\output\manual\theinformation-latest.txt",
  [string]$InputHtmlPath = "D:\codex\webaccess\output\manual\theinformation-latest.html",
  [string]$BriefJsonPath = "D:\codex\webaccess\output\manual\theinformation-brief.json",
  [string]$BriefTextPath = "D:\codex\webaccess\output\manual\theinformation-brief.txt",
  [string]$BriefHtmlPath = "D:\codex\webaccess\output\manual\theinformation-brief.html",
  [string]$BriefLogPath = "D:\codex\webaccess\output\manual\theinformation-brief-run.log"
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

$codexPath = powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\ensure-codex-cli.ps1")
$codexPath = ($codexPath | Select-Object -Last 1).Trim()

if (!(Test-Path $codexPath)) {
  throw "Local Codex CLI not available at $codexPath"
}

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

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$executionOutput =
  $promptText |
    & $codexPath `
      --dangerously-bypass-approvals-and-sandbox `
      -m gpt-5.4 `
      -c reasoning_effort='"high"' `
      exec `
      -C $root `
      --skip-git-repo-check `
      --color never `
      --output-schema $schemaPath `
      --output-last-message $BriefJsonPath `
      - 2>&1
$ErrorActionPreference = $previousErrorActionPreference

$executionOutput | Out-File -FilePath $tempLogPath -Encoding utf8

Move-Item -LiteralPath $tempLogPath -Destination $briefLogPath -Force

if ($LASTEXITCODE -ne 0) {
  Write-Error "Codex brief generation failed. See log at $briefLogPath"
}

node (Join-Path $root "scripts\render-theinformation-brief.mjs") --input $BriefJsonPath --text-output $BriefTextPath --html-output $BriefHtmlPath | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Brief renderer failed for $BriefJsonPath"
}

Write-Output "Saved brief JSON to $BriefJsonPath"
Write-Output "Saved brief text to $BriefTextPath"
Write-Output "Saved brief HTML to $BriefHtmlPath"
Write-Output "Saved brief log to $BriefLogPath"
