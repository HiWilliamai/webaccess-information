import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/run-theinformation-daily.ps1", import.meta.url);

test("daily runner preserves fetch command output when the fetch step fails", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /\$fetchOutput\s*=\s*&\s+node[\s\S]*fetch-theinformation\.mjs[\s\S]*2>&1/);
  assert.match(script, /\$fetchOutputText\s*=\s*\(\$fetchOutput\s*\|\s*Out-String\)\.Trim\(\)/);
  assert.match(script, /Fetch step failed while writing \$jsonPath[\s\S]*\$fetchOutputText/);
});
