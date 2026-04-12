$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profilePath = "D:\codex\webaccess\bb-profile"
$debugPort = 29825

function Get-DebugChromeProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" |
    Where-Object { $_.CommandLine -like "*--remote-debugging-port=$debugPort*" } |
    Select-Object -First 1
}

if (!(Test-Path $chromePath)) {
  throw "Chrome not found at $chromePath"
}

if (!(Test-Path $profilePath)) {
  New-Item -ItemType Directory -Path $profilePath | Out-Null
}

$version = $null
try {
  $version = Invoke-RestMethod "http://127.0.0.1:$debugPort/json/version" -TimeoutSec 2
} catch {
}

if ($version -and $version.webSocketDebuggerUrl) {
  $existingProcess = Get-DebugChromeProcess
  if ($null -eq $existingProcess) {
    throw "Remote debugging port $debugPort is active, but no matching Chrome process was found."
  }

  if ($existingProcess.CommandLine -notlike "*--user-data-dir=$profilePath*") {
    throw "Remote debugging port $debugPort is attached to a different Chrome profile. Current command line: $($existingProcess.CommandLine)"
  }

  Write-Output "Chrome debug session already running on port $debugPort"
  exit 0
}

Start-Process $chromePath "--user-data-dir=$profilePath --remote-debugging-port=$debugPort --remote-allow-origins=* --no-first-run --no-default-browser-check"

for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $version = Invoke-RestMethod "http://127.0.0.1:$debugPort/json/version" -TimeoutSec 2
    if ($version.webSocketDebuggerUrl) {
      Write-Output "Chrome started with remote debugging on port $debugPort"
      exit 0
    }
  } catch {
  }
}

throw "Chrome started, but remote debugging port $debugPort did not become ready in time."
