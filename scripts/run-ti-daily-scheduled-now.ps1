$ErrorActionPreference = "Stop"

$taskName = "TI Daily Report"
$root = "D:\codex\webaccess"
$outputDir = Join-Path $root "output\automation"
$logPath = Join-Path $outputDir "theinformation-scheduled-run.log"
$briefHtml = Join-Path $outputDir "theinformation-brief.html"
$briefTxt = Join-Path $outputDir "theinformation-brief.txt"
$pollSeconds = 5
$timeoutMinutes = 30

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  throw "Scheduled task '$taskName' was not found."
}

if ($task.State -eq "Running") {
  throw "Scheduled task '$taskName' is already running."
}

$startTime = Get-Date
$previousLastRunTime = ($task | Get-ScheduledTaskInfo).LastRunTime

Start-ScheduledTask -TaskName $taskName
Write-Output ("Started scheduled task '{0}' at {1}." -f $taskName, $startTime.ToString("yyyy-MM-dd HH:mm:ss"))

$deadline = $startTime.AddMinutes($timeoutMinutes)

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds $pollSeconds

  $task = Get-ScheduledTask -TaskName $taskName
  $info = $task | Get-ScheduledTaskInfo
  if ($task.State -eq "Ready" -and $info.LastRunTime -gt $previousLastRunTime) {
    if ($info.LastTaskResult -ne 0) {
      throw "Scheduled task failed with code $($info.LastTaskResult). Check $logPath"
    }

    Write-Output ("Scheduled task finished successfully at {0}." -f $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss"))
    if (Test-Path $briefHtml) {
      Start-Process $briefHtml
    }
    if (Test-Path $briefTxt) {
      Start-Process $briefTxt
    }
    exit 0
  }
}

throw "Timed out waiting for scheduled task '$taskName' to finish. Check $logPath"
