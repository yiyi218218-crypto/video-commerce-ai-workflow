import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HistoricalHyperFramesComposerAgent } from "../../src/agents/historical-hyperframes-composer/historical-hyperframes-composer-agent.js";
import { sampleHistoricalShortVideoOutput } from "../fixtures/historical-short-video-fixture.js";

describe("HistoricalHyperFramesComposerAgent", () => {
  it("writes a renderable HyperFrames composition package from a blueprint and assets", async () => {
    const projectRoot = await createComposerFixtureRoot();
    const sceneAssets = await createSceneAssets(projectRoot);
    const agent = new HistoricalHyperFramesComposerAgent({ projectRoot });

    const output = await agent.run({
      blueprint: sampleHistoricalShortVideoOutput,
      project_slug: "composer-ready-project",
      scene_assets: sceneAssets,
      overwrite_existing_composition: true,
    });

    expect(output.status).toBe("ready_for_render");
    expect(output.qa_expectations).toMatchObject({
      scene_count: 6,
      subtitle_mode: "sentence_chunks",
      aspect: "1080x1920",
    });

    const index = await readFile(
      path.join(projectRoot, "videos", "composer-ready-project", "index.html"),
      "utf8",
    );
    expect(index).toContain('data-composition-id="main"');
    expect(index).toContain("compositions/captions.html");

    const captions = await readFile(
      path.join(
        projectRoot,
        "videos",
        "composer-ready-project",
        "compositions",
        "captions.html",
      ),
      "utf8",
    );
    expect(captions).toContain("一杯酒，真能交出兵权吗？");
  });

  it("blocks when a storyboard scene has no local image asset", async () => {
    const projectRoot = await createComposerFixtureRoot();
    const agent = new HistoricalHyperFramesComposerAgent({ projectRoot });

    await expect(
      agent.run({
        blueprint: sampleHistoricalShortVideoOutput,
        project_slug: "missing-scene-assets",
        scene_assets: [
          {
            scene_id: sampleHistoricalShortVideoOutput.storyboard[0]!.scene_id,
            path: "fixtures/scene-01.png",
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      blocking_items: expect.arrayContaining([
        expect.stringContaining("缺少分镜素材"),
      ]),
    });
  });
});

async function createComposerFixtureRoot(): Promise<string> {
  const projectRoot = await mkdir(
    path.join(os.tmpdir(), `vca-composer-${globalThis.crypto.randomUUID()}`),
    { recursive: true },
  );
  if (!projectRoot) {
    throw new Error("Could not create fixture root.");
  }
  const vendorDir = path.join(
    projectRoot,
    "videos",
    "cup-wine-release-generals-short-drama",
    "assets",
    "vendor",
  );
  await mkdir(vendorDir, { recursive: true });
  await writeFile(path.join(vendorDir, "gsap-3.14.2.min.js"), "fake-gsap");
  return projectRoot;
}

async function createSceneAssets(
  projectRoot: string,
): Promise<Array<{ scene_id: string; path: string }>> {
  const fixtureDir = path.join(projectRoot, "fixtures");
  await mkdir(fixtureDir, { recursive: true });
  const assets = [];
  for (const [index, scene] of sampleHistoricalShortVideoOutput.storyboard.entries()) {
    const fileName = `scene-${String(index + 1).padStart(2, "0")}.png`;
    const filePath = path.join(fixtureDir, fileName);
    await writeFile(filePath, `fake-image-${index + 1}`);
    assets.push({
      scene_id: scene.scene_id,
      path: path.join("fixtures", fileName),
    });
  }
  return assets;
}
