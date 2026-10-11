import { Readable } from "node:stream";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductVideoProjectStore } from "../../src/services/video/product-video-project-store.js";
import type { SpeechSynthesizer } from "../../src/services/video/windows-speech-synthesizer.js";
import type { CreativeDirectorOutput } from "../../src/schemas/creative-production.schema.js";
import { analyzedSelectionBatch } from "../fixtures/product-selection.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("ProductVideoProjectStore", () => {
  it("prepares product assets, narration, copy, and commerce checklist", async () => {
    const { store, speechSynthesizer } = await createStore();

    const project = await store.create(
      analyzedSelectionBatch,
      analyzedSelectionBatch.analysis!.top_pick_id,
    );

    expect(project.status).toBe("prepared");
    expect(project.assets.image.media_type).toBe("image/png");
    expect(project.assets.narration?.media_type).toBe("audio/wav");
    expect(project.assets.bgm?.media_type).toBe("audio/wav");
    expect(project.creative_brief?.format).toBe(
      "hyperframes_product_story",
    );
    expect(project.hyperframes).toMatchObject({
      composition_id: "vca-product-story",
      entry_relative_path: "hyperframes/index.html",
    });
    expect(project.files).toContain("hyperframes/index.html");
    expect(speechSynthesizer.synthesize).toHaveBeenCalledOnce();
    expect(
      (await readFile(path.join(project.directory_path, "bgm.wav"))).subarray(0, 4).toString(),
    ).toBe("RIFF");
    expect(
      await readFile(
        path.join(project.directory_path, "02-视频文案.txt"),
        "utf8",
      ),
    ).toContain("创意短视频分镜");
    expect(
      await readFile(
        path.join(project.directory_path, "hyperframes", "index.html"),
        "utf8",
      ),
    ).toContain('data-composition-id="vca-product-story"');
    expect(
      await readFile(
        path.join(project.directory_path, "hyperframes", "index.html"),
        "utf8",
      ),
    ).toContain("gsap.timeline({ paused: true })");
    expect(
      await readFile(
        path.join(project.directory_path, "03-带货关联清单.md"),
        "utf8",
      ),
    ).toContain("加入橱窗");
  });

  it("stores a browser-rendered WebM after signature validation", async () => {
    const { store } = await createStore();
    const prepared = await store.create(
      analyzedSelectionBatch,
      analyzedSelectionBatch.analysis!.top_pick_id,
    );
    const video = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01,
    ]);

    const completed = await store.attachRenderedVideo(prepared.id, {
      mediaType: "video/webm",
      source: Readable.from(video),
      declaredBytes: video.length,
    });

    expect(completed.status).toBe("video_ready");
    expect(completed.rendered_video).toMatchObject({
      relative_path: "04-自动成片.webm",
      media_type: "video/webm",
      size_bytes: video.length,
    });
  });

  it("falls back to a local SVG when the remote image is not allowlisted", async () => {
    const batch = structuredClone(analyzedSelectionBatch);
    batch.candidates[0]!.image_url =
      "https://untrusted.example.com/product.png";
    const { store } = await createStore();

    const project = await store.create(
      batch,
      batch.analysis!.top_pick_id,
    );

    expect(project.assets.image.media_type).toBe("image/svg+xml");
    expect(project.warnings).toContain(
      "商品主图无法安全下载，自动成片使用商品名称占位卡。",
    );
  });

  it("writes a five-beat HyperFrames composition from the creative production pack", async () => {
    const { store } = await createStore();
    const project = await store.create(
      analyzedSelectionBatch,
      analyzedSelectionBatch.analysis!.top_pick_id,
      creativeProduction(),
    );
    const composition = await readFile(
      path.join(project.directory_path, "hyperframes", "index.html"),
      "utf8",
    );

    expect(project.creative_production?.beats).toHaveLength(5);
    expect(project.files).toContain("04-创意生产包.json");
    expect(project.files).toContain("hyperframes/STORYBOARD.md");
    expect(composition).toContain('data-width="1080"');
    expect(composition).toContain('id="director-scene-0"');
    expect(composition).toContain('id="caption-0"');
    expect(composition).toContain('id="director-bgm"');
    expect(composition).not.toContain('class="product-strip"');
  });
});

function creativeProduction(): CreativeDirectorOutput {
  const beats: CreativeDirectorOutput["beats"] = [
    [0, 3, "hook", "none", "越收越乱？"],
    [3, 6, "tension", "brief", "先看顺手"],
    [6, 9, "demonstration", "hero", "分层放好"],
    [9, 12, "proof", "hero", "参数先核对"],
    [12, 15, "invitation", "brief", "适合再选"],
  ].map(([start, end, story_role, product_visibility, on_screen_text]) => ({
    start_second: start as number,
    end_second: end as number,
    story_role: story_role as CreativeDirectorOutput["beats"][number]["story_role"],
    viewer_emotion: "共鸣",
    shot_type: "close_up" as const,
    action: "展示一个真实动作",
    product_visibility: product_visibility as CreativeDirectorOutput["beats"][number]["product_visibility"],
    voiceover: "一句口语旁白。",
    on_screen_text: on_screen_text as string,
    transition: "cut" as const,
  }));
  return {
    creative_route: "life_problem",
    one_sentence_promise: "从杂乱到顺手。",
    emotional_arc: "烦乱到松一口气",
    display_name: "折叠收纳架",
    production_readiness: "needs_assets",
    asset_requirements: [
      { kind: "product_detail", purpose: "细节", required: true },
      { kind: "voiceover", purpose: "旁白", required: true },
      { kind: "bgm", purpose: "配乐", required: true },
    ],
    beats,
    captions: beats.map((beat) => ({
      start_second: beat.start_second,
      end_second: beat.end_second,
      text: beat.on_screen_text,
      emphasis: "none" as const,
    })),
    bgm_direction: "轻快木吉他",
    sfx_cues: ["轻提示音"],
    facts_to_verify: ["尺寸"],
  };
}

async function createStore() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "vca-video-project-"),
  );
  directories.push(directory);
  const speechSynthesizer: SpeechSynthesizer = {
    synthesize: vi.fn(async (_textFile: string, outputFile: string) => {
      await writeFile(outputFile, Buffer.from("RIFFtestWAVE"));
    }),
  };
  const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": "4",
      },
    }),
  );
  return {
    store: new ProductVideoProjectStore({
      directory,
      speechSynthesizer,
      fetchImplementation,
    }),
    speechSynthesizer,
  };
}
