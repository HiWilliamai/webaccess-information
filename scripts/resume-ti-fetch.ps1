[CmdletBinding()]
param(
  [string]$PausePath = "D:\codex\webaccess\output\automation\theinformation-fetch.pause"
)

$ErrorActionPreference = "Stop"

if (Test-Path $PausePath) {
  Remove-Item -LiteralPath $PausePath -Force
  Write-Output "Fetch resume requested. Removed pause marker: $PausePath"
} else {
  Write-Output "Fetch is not paused. Pause marker was not found: $PausePath"
}
