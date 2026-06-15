[CmdletBinding()]
param(
  [string]$PausePath = "D:\codex\webaccess\output\automation\theinformation-fetch.pause"
)

$ErrorActionPreference = "Stop"

$pauseDir = Split-Path -Parent $PausePath
if (!(Test-Path $pauseDir)) {
  New-Item -ItemType Directory -Path $pauseDir | Out-Null
}

$timestamp = Get-Date -Format "o"
@{
  pausedAt = $timestamp
  message = "The Information fetch will pause before the next article."
} | ConvertTo-Json | Set-Content -Path $PausePath -Encoding UTF8

Write-Output "Fetch pause requested at $timestamp."
Write-Output "Pause marker: $PausePath"
