#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const result = {
    identity: "user",
    name: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--as") {
      result.identity = argv[index + 1] ?? result.identity;
      index += 1;
    } else if (arg === "--name") {
      result.name = argv[index + 1] ?? "";
      index += 1;
    }
  }

  if (!result.name) {
    throw new Error("Missing required --name value");
  }

  return result;
}

function runLark(args) {
  const command = process.platform === "win32" ? "cmd.exe" : "lark-cli";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "lark-cli.cmd", ...args]
      : args;
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(result.stderr || result.stdout || `lark-cli exited with status ${result.status}`);
    error.status = result.status;
    throw error;
  }

  const stdout = result.stdout?.trim();
  if (!stdout) {
    throw new Error("lark-cli returned empty output");
  }

  return JSON.parse(stdout);
}

function listRootFiles(identity) {
  return runLark(["drive", "files", "list", "--as", identity]);
}

function createRootFolder(identity, name) {
  return runLark([
    "drive",
    "files",
    "create_folder",
    "--as",
    identity,
    "--data",
    JSON.stringify({
      folder_token: "",
      name,
    }),
  ]);
}

function main() {
  const { identity, name } = parseArgs(process.argv.slice(2));
  const listing = listRootFiles(identity);
  const existingFolder = listing?.data?.files?.find((file) => file?.type === "folder" && file?.name === name);

  if (existingFolder) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        created: false,
        token: existingFolder.token,
        url: existingFolder.url,
        name,
      }),
    );
    return;
  }

  const createdFolder = createRootFolder(identity, name);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      created: true,
      token: createdFolder?.data?.token ?? "",
      url: createdFolder?.data?.url ?? "",
      name,
    }),
  );
}

main();
