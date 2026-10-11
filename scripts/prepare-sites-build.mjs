#!/usr/bin/env node

import {
  access,
  copyFile,
  cp,
  mkdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exportedSite = path.join(projectRoot, "out");
const exportedIndex = path.join(exportedSite, "index.html");
const workerEntry = path.join(projectRoot, "worker", "index.ts");
const hostingConfig = path.join(
  projectRoot,
  ".openai",
  "hosting.json",
);
const distDirectory = path.join(projectRoot, "dist");
const serverDirectory = path.join(distDirectory, "server");
const clientDirectory = path.join(distDirectory, "client");
const distHostingDirectory = path.join(distDirectory, ".openai");

for (const requiredPath of [
  exportedIndex,
  workerEntry,
  hostingConfig,
]) {
  try {
    await access(requiredPath);
  } catch {
    throw new Error(`Missing Sites build input: ${requiredPath}`);
  }
}

await Promise.all([
  mkdir(serverDirectory, { recursive: true }),
  mkdir(clientDirectory, { recursive: true }),
  mkdir(distHostingDirectory, { recursive: true }),
]);
await cp(exportedSite, clientDirectory, {
  recursive: true,
  force: true,
});
await Promise.all([
  build({
    entryPoints: [workerEntry],
    outfile: path.join(serverDirectory, "index.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    loader: {
      ".md": "text",
    },
    logLevel: "warning",
  }),
  copyFile(
    hostingConfig,
    path.join(distHostingDirectory, "hosting.json"),
  ),
]);

process.stdout.write(
  "Prepared Sites Worker API and static output in dist/.\n",
);
