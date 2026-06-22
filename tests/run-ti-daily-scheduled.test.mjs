import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/run-ti-daily-scheduled.ps1", import.meta.url);
const dailyScriptPath = new URL("../scripts/run-theinformation-daily.ps1", import.meta.url);

test("scheduled automation defaults brief generation to three attempts", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /THE_INFORMATION_BRIEF_MAX_ATTEMPTS/);
  assert.match(script, /\$env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS\s*=\s*"3"/);
  assert.match(script, /\[string\]::IsNullOrWhiteSpace\(\$env:THE_INFORMATION_BRIEF_MAX_ATTEMPTS\)/);
});

test("scheduled automation defaults Cloudflare fetch recovery settings", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /THE_INFORMATION_CLOUDFLARE_CLEAR_TIMEOUT_MS/);
  assert.match(script, /\$env:THE_INFORMATION_CLOUDFLARE_CLEAR_TIMEOUT_MS\s*=\s*"480000"/);
  assert.match(script, /THE_INFORMATION_FETCH_MAX_ATTEMPTS/);
  assert.match(script, /\$env:THE_INFORMATION_FETCH_MAX_ATTEMPTS\s*=\s*"3"/);
  assert.match(script, /THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS/);
  assert.match(script, /\$env:THE_INFORMATION_FETCH_RETRY_DELAY_SECONDS\s*=\s*"60"/);
});

test("scheduled automation retries retryable Cloudflare and browser page failures", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /for\s*\(\s*\$dailyAttempt\s*=\s*1;\s*\$dailyAttempt\s+-le\s+\$fetchMaxAttempts;/);
  assert.match(script, /\$dailyOutput\s*=\s*&\s+powershell[\s\S]*-File\s+\$dailyScript[\s\S]*2>&1/);
  assert.match(
    script,
    /\$isRetryableFetchFailure\s*=\s*\$dailyOutputText\s*-match\s*"retryable_\(cloudflare_challenge\|browser_page_failure\)"/
  );
  assert.match(script, /\$currentRetryDelaySeconds\s*=\s*\$fetchRetryDelaySeconds/);
  assert.match(script, /if\s*\(\s*\$dailyAttempt\s*-eq\s*2\s*\)\s*{[\s\S]*\$currentRetryDelaySeconds\s*=\s*120/);
  assert.match(script, /Start-Sleep\s+-Seconds\s+\$currentRetryDelaySeconds/);
});

test("scheduled automation captures daily stderr before retry evaluation", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(
    script,
    /\$previousErrorActionPreference\s*=\s*\$ErrorActionPreference[\s\S]*\$ErrorActionPreference\s*=\s*"Continue"[\s\S]*\$dailyOutput\s*=\s*&\s+powershell[\s\S]*-File\s+\$dailyScript[\s\S]*2>&1[\s\S]*\$dailyExitCode\s*=\s*\$LASTEXITCODE[\s\S]*finally\s*{[\s\S]*\$ErrorActionPreference\s*=\s*\$previousErrorActionPreference/
  );
  assert.match(
    script,
    /\$isRetryableFetchFailure\s*=\s*\$dailyOutputText\s*-match\s*"retryable_\(cloudflare_challenge\|browser_page_failure\)"/
  );
});

test("daily automation captures fetch stderr before checking retryable payload", async () => {
  const script = await readFile(dailyScriptPath, "utf8");

  assert.match(
    script,
    /\$previousErrorActionPreference\s*=\s*\$ErrorActionPreference[\s\S]*\$ErrorActionPreference\s*=\s*"Continue"[\s\S]*\$fetchOutput\s*=\s*&\s+node[\s\S]*fetch-theinformation\.mjs[\s\S]*2>&1[\s\S]*\$fetchExitCode\s*=\s*\$LASTEXITCODE[\s\S]*finally\s*{[\s\S]*\$ErrorActionPreference\s*=\s*\$previousErrorActionPreference/
  );
});
