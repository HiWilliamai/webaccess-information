import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/publish-theinformation-brief-to-lark.ps1", import.meta.url);

test("publish script passes lark-cli arguments through a non-reserved parameter", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /function Invoke-LarkCliWithRetry\s*{[\s\S]*\[string\[\]\]\$CliArgs/);
  assert.match(script, /& lark-cli @CliArgs/);
  assert.doesNotMatch(script, /function Invoke-LarkCliWithRetry\s*{[\s\S]*\[string\[\]\]\$Args/);
});

test("publish script verifies detail and index documents after Lark writes", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /Assert-LarkDocumentContainsMarkers -Doc \$detailDocId/);
  assert.match(script, /Assert-LarkDocumentContainsMarkers -Doc \$resolvedIndexDocId/);
  assert.match(script, /docs", "\+fetch", "--api-version", "v2", "--as", \$Identity, "--doc", \$Doc[\s\S]*"\.data\.document\.content"/);
  assert.match(script, /docs", "\+create", "--api-version", "v2", "--as", \$Identity/);
  assert.match(script, /docs", "\+update", "--api-version", "v2", "--as", \$Identity/);
  assert.match(script, /"--doc-format", "markdown", "--content"/);
  assert.match(script, /"--command", \$chunkCommand/);
});
