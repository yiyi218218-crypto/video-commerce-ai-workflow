import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HistoricalVideoProjectAgent } from "../../src/agents/historical-video-project/historical-video-project-agent.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import { sampleHistoricalShortVideoOutput } from "../fixtures/historical-short-video-fixture.js";

describe("HistoricalVideoProjectAgent", () => {
  it("scaffolds a reusable HyperFrames production package", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "vca-historical-project-"),
    );
    const agent = new HistoricalVideoProjectAgent(
      { projectRoot },
      new PromptLoader(),
    );

    const output = await agent.run({
      blueprint: sampleHistoricalShortVideoOutput,
      project_slug: "cup-wine-release-generals",
    });

    expect(output.status).toBe("created");
    expect(output.files.map((file) => path.basename(file.path))).toEqual(
      expect.arrayContaining([
        "BRIEF.md",
        "SCRIPT.md",
        "STORYBOARD.md",
        "frame.md",
        "publish-copy.txt",
        "production-plan.json",
      ]),
    );
    expect(output.publish_bridge.compatible_agent).toBe(
      "wechat_channel_publisher_agent",
    );

    const storyboard = await readFile(
      path.join(
        projectRoot,
        "videos",
        "cup-wine-release-generals",
        "STORYBOARD.md",
      ),
      "utf8",
    );
    expect(storyboard).toContain("一杯酒的问题");
    expect(storyboard).toContain("禁止一张图反复裁切");
  });

  it("blocks by default when a project folder already exists", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "vca-historical-project-"),
    );
    const agent = new HistoricalVideoProjectAgent({ projectRoot });

    await agent.run({
      blueprint: sampleHistoricalShortVideoOutput,
      project_slug: "existing-project",
    });

    await expect(
      agent.run({
        blueprint: sampleHistoricalShortVideoOutput,
        project_slug: "existing-project",
      }),
    ).resolves.toMatchObject({
      status: "blocked",
      blocking_items: [
        expect.stringContaining("项目目录已存在"),
      ],
    });
  });
});
