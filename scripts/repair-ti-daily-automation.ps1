$ErrorActionPreference = "Stop"

$automationId = "ti-daily-report"
$codexHome = "C:\Users\guoya\.codex"
$dbPath = Join-Path $codexHome "sqlite\codex-dev.db"
$globalStatePath = Join-Path $codexHome ".codex-global-state.json"

if (!(Test-Path $dbPath)) {
  throw "Codex DB not found at $dbPath"
}

if (!(Test-Path $globalStatePath)) {
  throw "Codex global state file not found at $globalStatePath"
}

$backupDir = Split-Path -Parent $dbPath
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $backupDir "codex-dev.backup-$timestamp.db"
Copy-Item -LiteralPath $dbPath -Destination $backupPath -Force

$pythonScript = @'
import json
import sqlite3
import sys
from pathlib import Path

db_path = Path(sys.argv[1])
automation_id = sys.argv[2]
global_state_path = Path(sys.argv[3])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
rows = cur.execute(
    "SELECT thread_id FROM automation_runs WHERE automation_id = ? AND status = 'IN_PROGRESS'",
    (automation_id,)
).fetchall()
thread_ids = [row["thread_id"] for row in rows]
cur.execute(
    "DELETE FROM automation_runs WHERE automation_id = ? AND status = 'IN_PROGRESS'",
    (automation_id,)
)
conn.commit()
remaining = cur.execute(
    "SELECT COUNT(*) FROM automation_runs WHERE automation_id = ? AND status = 'IN_PROGRESS'",
    (automation_id,)
).fetchone()[0]
conn.close()

state = json.loads(global_state_path.read_text(encoding="utf-8"))
state["thread-workspace-root-hints"] = {}
global_state_path.write_text(
    json.dumps(state, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)

print(json.dumps({
    "thread_ids": thread_ids,
    "remaining_in_progress": remaining
}, ensure_ascii=False))
'@

$dbResultJson = $pythonScript | python - $dbPath $automationId $globalStatePath
$dbResult = $dbResultJson | ConvertFrom-Json

Write-Output "Backed up DB to $backupPath"
Write-Output "Cleared in-progress runs for $automationId"
if ($dbResult.thread_ids.Count -gt 0) {
  Write-Output ("Removed thread hints: " + ($dbResult.thread_ids -join ", "))
} else {
  Write-Output "No stale in-progress runs were found"
}
