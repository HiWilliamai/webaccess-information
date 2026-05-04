import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/generate-theinformation-brief.ps1", import.meta.url);

test("brief generation retries transient gpt model gate failures", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /\[int\]\$MaxBriefAttempts\s*=\s*2/);
  assert.match(script, /requires a newer version of Codex/);
  assert.match(script, /for\s*\(\s*\$attempt\s*=\s*1;\s*\$attempt\s+-le\s+\$MaxBriefAttempts;/);
  assert.match(script, /Start-Sleep\s+-Seconds/);
});

test("brief generation logs selected Codex CLI path and version", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /\$codexVersion\s*=\s*&\s*\$codexPath\s+--version/);
  assert.match(script, /Using Codex CLI at \$codexPath/);
});
