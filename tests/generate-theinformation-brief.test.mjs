import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/generate-theinformation-brief.ps1", import.meta.url);
const promptPath = new URL("../prompts/ti-daily-brief-prompt.txt", import.meta.url);
const schemaPath = new URL("../schemas/ti-daily-brief.schema.json", import.meta.url);

test("brief generation retries transient gpt model gate failures", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /\[int\]\$MaxBriefAttempts\s*=\s*2/);
  assert.match(script, /requires a newer version of Codex/);
  assert.match(script, /Selected model is at capacity/);
  assert.match(script, /for\s*\(\s*\$attempt\s*=\s*1;\s*\$attempt\s+-le\s+\$MaxBriefAttempts;/);
  assert.match(script, /Start-Sleep\s+-Seconds/);
});

test("brief generation logs selected Codex CLI path and version", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /\$codexVersion\s*=\s*&\s*\$codexPath\s+--version/);
  assert.match(script, /Using Codex CLI at \$codexPath/);
});

test("brief generation allows automation env overrides for model and attempts", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /THE_INFORMATION_BRIEF_MODEL/);
  assert.match(script, /THE_INFORMATION_BRIEF_MAX_ATTEMPTS/);
  assert.match(script, /\$PSBoundParameters\.ContainsKey\("BriefModel"\)/);
  assert.match(script, /\$PSBoundParameters\.ContainsKey\("MaxBriefAttempts"\)/);
});

test("brief generation auto-detects local Codex proxy before login check", async () => {
  const script = await readFile(scriptPath, "utf8");

  const proxySetupIndex = script.indexOf("$proxySetupMessage = Enable-CodexProxyIfAvailable");
  const loginStatusIndex = script.indexOf("$codexPath login status");

  assert.notEqual(proxySetupIndex, -1);
  assert.notEqual(loginStatusIndex, -1);
  assert.ok(proxySetupIndex < loginStatusIndex);
  assert.match(script, /THE_INFORMATION_CODEX_PROXY_URL/);
  assert.match(script, /HTTP_PROXY/);
  assert.match(script, /127\.0\.0\.1:7897/);
});

test("brief generation checks Codex login before deleting prior outputs", async () => {
  const script = await readFile(scriptPath, "utf8");

  const loginStatusIndex = script.indexOf("$codexPath login status");
  const removeOutputIndex = script.indexOf("foreach ($outputPath in @($BriefJsonPath, $BriefTextPath, $BriefHtmlPath))");

  assert.notEqual(loginStatusIndex, -1);
  assert.notEqual(removeOutputIndex, -1);
  assert.ok(loginStatusIndex < removeOutputIndex);
  assert.match(script, /Codex CLI is not logged in/);
});

test("brief generation validates output titles against latest source before rendering", async () => {
  const script = await readFile(scriptPath, "utf8");

  const validationIndex = script.indexOf("validate-theinformation-brief-against-latest.mjs");
  const normalizationIndex = script.indexOf("normalize-theinformation-brief-source-fields.mjs");
  const renderIndex = script.indexOf("render-theinformation-brief.mjs");

  assert.notEqual(validationIndex, -1);
  assert.notEqual(normalizationIndex, -1);
  assert.notEqual(renderIndex, -1);
  assert.ok(validationIndex < renderIndex);
  assert.ok(validationIndex < normalizationIndex);
  assert.ok(normalizationIndex < renderIndex);
});

test("brief prompt prioritizes Exclusive articles first with higher detail", async () => {
  const prompt = await readFile(promptPath, "utf8");

  assert.match(prompt, /Exclusive full articles must appear before non-Exclusive full articles/);
  assert.match(prompt, /Exclusive articles must use finer granularity than ordinary articles/);
});

test("brief prompt and schema require title translations for incomplete article groups", async () => {
  const prompt = await readFile(promptPath, "utf8");
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const incompleteArticle = schema.$defs.incompleteArticle;

  assert.match(prompt, /partial_articles`, `blocked_articles`, and `unprocessed_articles`.*`title_translation`/s);
  assert.ok(incompleteArticle.required.includes("title_translation"));
  assert.equal(incompleteArticle.properties.title_translation.type, "string");
});
