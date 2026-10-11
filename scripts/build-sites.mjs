#!/usr/bin/env node

import { spawnSync } from "node:child_process";

run(process.execPath, ["scripts/prepare-sites-build.mjs"]);
run(process.execPath, ["--test", "tests/sites-build.test.mjs"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
