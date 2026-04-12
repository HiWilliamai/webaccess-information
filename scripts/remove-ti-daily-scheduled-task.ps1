$ErrorActionPreference = "Stop"

$taskName = "TI Daily Report"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Output "Removed scheduled task '$taskName'."
} else {
  Write-Output "Scheduled task '$taskName' was not found."
}
