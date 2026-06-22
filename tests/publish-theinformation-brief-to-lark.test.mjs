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
  assert.match(script, /docs", "\+fetch", "--api-version", "v2", "--as", \$Identity, "--doc", \$Doc, "--doc-format", "markdown"[\s\S]*"\.data\.document\.content"/);
  assert.match(script, /docs", "\+create", "--api-version", "v2", "--as", \$Identity/);
  assert.match(script, /docs", "\+update", "--api-version", "v2", "--as", \$Identity/);
  assert.match(script, /"--doc-format", "markdown", "--content", \$initialContent/);
  assert.doesNotMatch(script, /docs", "\+create"[\s\S]*"--title", \$Title, "--markdown"/);
  assert.match(script, /"--doc-format", "markdown", "--content", \$chunks\[\$chunkIndex\]/);
  assert.match(script, /"--command", \$chunkCommand/);
  assert.doesNotMatch(script, /"--mode", \$chunkCommand/);
});

test("publish script creates one Markdown document title and demotes body headings", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /return "# \$Title`n`n\$bodyMarkdown"/);
  assert.ok(script.includes("[regex]::Replace($Markdown, '(?m)^(#{1,5})(?=\\s)', '#$1')"));
});

test("publish script normalizes escaped Markdown before marker verification", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /function ConvertFrom-LarkMarkdownEscapes/);
  assert.match(script, /\$markdown = ConvertFrom-LarkMarkdownEscapes -Markdown \$markdown/);
});
