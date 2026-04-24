import fs from "fs";
import path from "path";

import { buildPublishPayload } from "./theinformation-lark-publish-lib.mjs";

function getArgValue(flagName) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flagName);
  if (index >= 0 && args[index + 1]) {
    return path.resolve(args[index + 1]);
  }
  return null;
}

function main() {
  const latestPath = getArgValue("--latest");
  const briefJsonPath = getArgValue("--brief-json");
  const briefTextPath = getArgValue("--brief-text");

  if (!latestPath || !briefJsonPath || !briefTextPath) {
    throw new Error("Missing required args: --latest, --brief-json, --brief-text");
  }

  const latestData = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const briefData = JSON.parse(fs.readFileSync(briefJsonPath, "utf8"));
  const briefText = fs.readFileSync(briefTextPath, "utf8");

  const payload = buildPublishPayload({
    latestData,
    briefData,
    briefText
  });

  console.log(JSON.stringify(payload, null, 2));
}

main();
