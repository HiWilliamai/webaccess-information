$ErrorActionPreference = "Stop"

$taskName = "TI Daily Report"
$root = "D:\codex\webaccess"
$scriptPath = Join-Path $root "scripts\run-ti-daily-scheduled.ps1"

if (!(Test-Path $scriptPath)) {
  throw "Scheduled runner not found at $scriptPath"
}

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At 9:30AM
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Limited

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

$info = Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo
Write-Output "Registered scheduled task '$taskName' for $userId."
Write-Output ("Next run time: " + $info.NextRunTime.ToString("yyyy-MM-dd HH:mm:ss"))
