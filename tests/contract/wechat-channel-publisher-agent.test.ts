import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WeChatChannelPublisherAgent } from "../../src/agents/publishing/wechat-channel-publisher-agent.js";
import { AgentInputValidationError } from "../../src/errors.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const directory of tempDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("vca-wechat-agent-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("WeChatChannelPublisherAgent", () => {
  it("writes a guarded publish job for a reviewed video", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "vca-wechat-agent-"),
    );
    tempDirectories.push(projectRoot);
    const videoPath = path.join(projectRoot, "final.mp4");
    await writeFile(videoPath, Buffer.from("ftyp-test-video"));

    const agent = new WeChatChannelPublisherAgent({ projectRoot });
    const output = await agent.run({
      video_path: videoPath,
      short_title: "杯酒释兵权真相",
      description:
        "一杯酒，真能收回兵权吗？画面为 AI 辅助创作。\n\n#历史 #宋朝",
      confirm_publish: true,
      action: "prepare_and_publish",
    });

    expect(output.status).toBe("ready");
    expect(output.blocking_items).toEqual([]);
    expect(output.safety_checks).toMatchObject({
      expected_channel_name: "星轨潮汐.",
      location_policy: "不显示位置",
      ai_disclosure_required: true,
      product_link_policy: "none_unless_explicitly_requested",
    });
    expect(output.duplicate_check).toMatchObject({
      checked: false,
      matches: [],
      policy: "warn",
    });

    const job = JSON.parse(
      await readFile(output.job_file_path, "utf8"),
    ) as Record<string, unknown>;
    expect(job).toMatchObject({
      shortTitle: "杯酒释兵权真相",
      expectedChannelName: "星轨潮汐.",
      aiGenerated: true,
      confirmPublish: true,
    });
  });

  it("blocks when the video file is missing", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "vca-wechat-agent-"),
    );
    tempDirectories.push(projectRoot);

    const agent = new WeChatChannelPublisherAgent({ projectRoot });
    const output = await agent.run({
      video_path: "missing.mp4",
      short_title: "杯酒释兵权真相",
      description: "画面为 AI 辅助创作。\n\n#历史",
      confirm_publish: true,
    });

    expect(output.status).toBe("blocked");
    expect(output.blocking_items[0]).toContain("视频文件不存在");
  });

  it("requires explicit confirmation before preparing live publish commands", async () => {
    const agent = new WeChatChannelPublisherAgent();

    await expect(
      agent.run({
        video_path: "final.mp4",
        short_title: "杯酒释兵权真相",
        description: "画面为 AI 辅助创作。\n\n#历史",
        action: "prepare_and_publish",
      }),
    ).rejects.toBeInstanceOf(AgentInputValidationError);
  });

  it("blocks publishing when duplicate policy is strict and the topic is similar", async () => {
    const projectRoot = await mkdtemp(
      path.join(os.tmpdir(), "vca-wechat-agent-"),
    );
    tempDirectories.push(projectRoot);
    const videoPath = path.join(projectRoot, "final.mp4");
    await writeFile(videoPath, Buffer.from("ftyp-test-video"));

    const agent = new WeChatChannelPublisherAgent({ projectRoot });
    const output = await agent.run({
      video_path: videoPath,
      short_title: "鸿门宴输在犹豫",
      description:
        "范增三次举玉玦，项庄舞剑逼近，项羽没有下决断，刘邦等到了脱身窗口。画面为 AI 辅助创作。\n\n#历史 #鸿门宴",
      confirm_publish: true,
      recent_published_texts: [
        "鸿门宴上，范增三次举玦，项庄舞剑，刘邦却从楚军眼前脱身。",
      ],
      duplicate_policy: "block",
    });

    expect(output.status).toBe("blocked");
    expect(output.duplicate_check.matches[0]).toMatchObject({
      shared_terms: expect.arrayContaining(["鸿门宴", "范增", "项庄", "刘邦"]),
    });
    expect(output.blocking_items[0]).toContain("疑似重复选题");
  });
});
