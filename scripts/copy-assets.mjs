import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const copies = [
  ["src/prompts", "dist/prompts"],
  ["src/workflows/definitions", "dist/workflows/definitions"],
];

for (const [source, destination] of copies) {
  const sourcePath = path.join(projectRoot, source);
  const destinationPath = path.join(projectRoot, destination);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true });
}
