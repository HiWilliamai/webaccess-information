import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scriptPath = new URL("../scripts/ensure-codex-cli.ps1", import.meta.url);

test("ensure script searches the Codex app LocalCache install before stale sandbox copies", async () => {
  const script = await readFile(scriptPath, "utf8");

  const localCacheIndex = script.indexOf("LocalCache\\Local\\OpenAI\\Codex\\bin\\codex.exe");
  const sandboxIndex = script.indexOf(".codex\\.sandbox-bin\\codex.exe");

  assert.notEqual(localCacheIndex, -1);
  assert.notEqual(sandboxIndex, -1);
  assert.ok(localCacheIndex < sandboxIndex);
});

test("ensure script chooses the highest detected Codex CLI version", async () => {
  const script = await readFile(scriptPath, "utf8");

  assert.match(script, /Get-CodexCliVersion/);
  assert.match(script, /Sort-Object[\s\S]*Version/);
  assert.match(script, /Select-Object\s+-First\s+1/);
});
