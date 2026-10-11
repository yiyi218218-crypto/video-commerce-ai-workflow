import path from "node:path";
import process from "node:process";

import {
  isHyperFramesRenderQuality,
  renderStableHyperFrames,
} from "../src/services/video/stable-hyperframes-renderer.js";

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const result = await renderStableHyperFrames(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function parseCli(args: string[]): {
  projectDirectory: string;
  outputPath: string;
  requestedQuality: "draft" | "standard" | "high";
  runCheck: boolean;
} {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      [
        "Usage:",
        "  npm run hf:stable-render -- --project-dir <project> --output <file.mp4> [--quality draft|standard|high]",
        "",
        "Options:",
        "  --project-dir, --project  HyperFrames project directory. Defaults to current directory.",
        "  --output, -o             Output MP4 path.",
        "  --quality                Requested quality. Defaults to standard.",
        "  --skip-check             Skip HyperFrames check before rendering.",
      ].join("\n"),
    );
    process.exit(0);
  }
  const read = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const projectDirectory = path.resolve(
    read("--project-dir") ?? read("--project") ?? args[0] ?? process.cwd(),
  );
  const output = read("--output") ?? read("-o");
  if (!output) {
    throw new Error("Missing required --output <file>.");
  }
  const quality = read("--quality") ?? "standard";
  if (!isHyperFramesRenderQuality(quality)) {
    throw new Error(`Invalid --quality value: ${quality}`);
  }
  return {
    projectDirectory,
    outputPath: path.resolve(output),
    requestedQuality: quality,
    runCheck: !args.includes("--skip-check"),
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
