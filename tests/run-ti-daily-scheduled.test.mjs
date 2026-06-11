import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/run-ti-daily-scheduled.ps1", import.meta.url);

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

test("scheduled automation retries the daily run only for retryable Cloudflare failures", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /for\s*\(\s*\$dailyAttempt\s*=\s*1;\s*\$dailyAttempt\s+-le\s+\$fetchMaxAttempts;/);
  assert.match(script, /\$dailyOutput\s*=\s*&\s+powershell[\s\S]*-File\s+\$dailyScript[\s\S]*2>&1/);
  assert.match(script, /\$isRetryableCloudflareFailure\s*=\s*\$dailyOutputText\s*-match\s*"retryable_cloudflare_challenge"/);
  assert.match(script, /\$currentRetryDelaySeconds\s*=\s*\$fetchRetryDelaySeconds/);
  assert.match(script, /if\s*\(\s*\$dailyAttempt\s*-eq\s*2\s*\)\s*{[\s\S]*\$currentRetryDelaySeconds\s*=\s*120/);
  assert.match(script, /Start-Sleep\s+-Seconds\s+\$currentRetryDelaySeconds/);
});
