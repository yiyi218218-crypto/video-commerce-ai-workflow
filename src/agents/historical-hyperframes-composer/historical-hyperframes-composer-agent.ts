import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AgentInputValidationError } from "../../errors.js";
import {
  historicalHyperFramesComposerInputSchema,
  historicalHyperFramesComposerOutputSchema,
  type HistoricalHyperFramesComposerInput,
  type HistoricalHyperFramesComposerOutput,
  type HistoricalHyperFramesComposerParsedInput,
} from "../../schemas/historical-hyperframes-composer-agent.schema.js";
import type {
  HistoricalShortVideoOutput,
} from "../../schemas/historical-short-video-agent.schema.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import type { AgentDescriptor, ContractAgent } from "../agent.js";

interface HistoricalHyperFramesComposerAgentOptions {
  projectRoot?: string;
}

interface LocalScene {
  scene: HistoricalShortVideoOutput["storyboard"][number];
  imageSrc: string;
  fileName: string;
  compositionId: string;
  copiedImagePath: string;
}

interface GeneratedFile {
  path: string;
  purpose: HistoricalHyperFramesComposerOutput["files"][number]["purpose"];
}

const gsapSourceCandidates = [
  path.join(
    "videos",
    "cup-wine-release-generals-short-drama",
    "assets",
    "vendor",
    "gsap-3.14.2.min.js",
  ),
  path.join(
    "videos",
    "hongmen-banquet-short-drama",
    "assets",
    "vendor",
    "gsap-3.14.2.min.js",
  ),
  path.join(
    "videos",
    "wei-rescue-zhao-short-drama",
    "assets",
    "vendor",
    "gsap-3.14.2.min.js",
  ),
];

const fontSourceCandidates = {
  sans: [
    path.join(
      "videos",
      "cup-wine-release-generals-short-drama",
      "assets",
      "fonts",
      "NotoSansSC-VF.ttf",
    ),
    path.join(
      "videos",
      "hongmen-banquet-short-drama",
      "assets",
      "fonts",
      "NotoSansSC-VF.ttf",
    ),
  ],
  serif: [
    path.join(
      "videos",
      "cup-wine-release-generals-short-drama",
      "assets",
      "fonts",
      "NotoSerifSC-VF.ttf",
    ),
    path.join(
      "videos",
      "hongmen-banquet-short-drama",
      "assets",
      "fonts",
      "NotoSerifSC-VF.ttf",
    ),
  ],
};

export class HistoricalHyperFramesComposerAgent
  implements
    ContractAgent<
      HistoricalHyperFramesComposerInput,
      HistoricalHyperFramesComposerOutput
    >
{
  readonly name = "historical_hyperframes_composer_agent";
  readonly inputSchema = historicalHyperFramesComposerInputSchema;
  readonly outputSchema = historicalHyperFramesComposerOutputSchema;
  readonly prompt = {
    id: "historical_hyperframes_composer_agent",
    version: "1.0.0",
    file: new URL(
      "../../prompts/historical-hyperframes-composer-agent.md",
      import.meta.url,
    ),
  };

  constructor(
    private readonly options: HistoricalHyperFramesComposerAgentOptions = {},
    private readonly promptLoader?: PromptSource,
  ) {}

  async describe(): Promise<AgentDescriptor> {
    if (!this.promptLoader) {
      return { name: this.name };
    }
    const prompt = await this.promptLoader.load(this.prompt);
    return {
      name: this.name,
      prompt: {
        id: prompt.id,
        version: prompt.version,
        sha256: prompt.sha256,
      },
    };
  }

  async run(
    rawInput: HistoricalHyperFramesComposerInput,
  ): Promise<HistoricalHyperFramesComposerOutput> {
    const parsed = this.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AgentInputValidationError(this.name, parsed.error.issues);
    }

    const input = parsed.data;
    const projectRoot = path.resolve(
      input.project_root ?? this.options.projectRoot ?? process.cwd(),
    );
    const projectPath = path.resolve(projectRoot, "videos", input.project_slug);
    assertInsideDirectory(path.resolve(projectRoot, "videos"), projectPath);

    const expectedRenderedVideoPath = path.join(
      projectPath,
      "renders",
      input.output_file_name ??
        `${safeFileName(input.blueprint.short_title)}-发布版.mp4`,
    );
    const blockingItems = buildBlockingItems(input, projectRoot, projectPath);
    const warnings = buildWarnings(input);
    const renderCommands = buildRenderCommands(
      projectPath,
      expectedRenderedVideoPath,
      input.blueprint,
    );

    if (blockingItems.length > 0) {
      return this.outputSchema.parse({
        status: "blocked",
        project_slug: input.project_slug,
        project_path: projectPath,
        expected_rendered_video_path: expectedRenderedVideoPath,
        files: [],
        render_commands: renderCommands,
        qa_expectations: {
          scene_count: input.blueprint.storyboard.length,
          has_voice: input.voice_clips.length > 0,
          has_bgm: input.bgm_path !== undefined,
          subtitle_mode: "sentence_chunks",
          aspect: "1080x1920",
        },
        blocking_items: blockingItems,
        warnings,
      });
    }

    const generatedFiles = await writeCompositionFiles(
      input,
      projectRoot,
      projectPath,
      expectedRenderedVideoPath,
    );

    return this.outputSchema.parse({
      status: "ready_for_render",
      project_slug: input.project_slug,
      project_path: projectPath,
      expected_rendered_video_path: expectedRenderedVideoPath,
      files: generatedFiles,
      render_commands: renderCommands,
      qa_expectations: {
        scene_count: input.blueprint.storyboard.length,
        has_voice: input.voice_clips.length > 0,
        has_bgm: input.bgm_path !== undefined,
        subtitle_mode: "sentence_chunks",
        aspect: "1080x1920",
      },
      blocking_items: [],
      warnings,
    });
  }
}

async function writeCompositionFiles(
  input: HistoricalHyperFramesComposerParsedInput,
  projectRoot: string,
  projectPath: string,
  expectedRenderedVideoPath: string,
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const compositionsDir = path.join(projectPath, "compositions");
  const framesDir = path.join(compositionsDir, "frames");
  const imagesDir = path.join(projectPath, "assets", "images", "scenes");
  const vendorDir = path.join(projectPath, "assets", "vendor");
  const fontsDir = path.join(projectPath, "assets", "fonts");

  await mkdir(framesDir, { recursive: true });
  await mkdir(imagesDir, { recursive: true });
  await mkdir(vendorDir, { recursive: true });
  await mkdir(fontsDir, { recursive: true });
  await mkdir(path.join(projectPath, "renders"), { recursive: true });

  const gsapPath = path.join(vendorDir, "gsap-3.14.2.min.js");
  await copyFile(findFirstExisting(projectRoot, gsapSourceCandidates), gsapPath);
  files.push({ path: gsapPath, purpose: "copied_asset" });

  await copyOptionalFont(
    projectRoot,
    fontSourceCandidates.sans,
    path.join(fontsDir, "NotoSansSC-VF.ttf"),
    files,
  );
  await copyOptionalFont(
    projectRoot,
    fontSourceCandidates.serif,
    path.join(fontsDir, "NotoSerifSC-VF.ttf"),
    files,
  );

  const scenes = await copySceneAssets(input, projectRoot, projectPath);
  for (const scene of scenes) {
    files.push({ path: scene.copiedImagePath, purpose: "copied_asset" });
  }

  const audioAssets = await copyAudioAssets(input, projectRoot, projectPath);
  files.push(...audioAssets.files);

  for (const localScene of scenes) {
    const framePath = path.join(framesDir, localScene.fileName);
    await writeFile(
      framePath,
      buildSceneHtml(localScene, input.blueprint),
      "utf8",
    );
    files.push({ path: framePath, purpose: "scene_composition" });
  }

  const captionsPath = path.join(compositionsDir, "captions.html");
  await writeFile(captionsPath, buildCaptionsHtml(input.blueprint), "utf8");
  files.push({ path: captionsPath, purpose: "caption_composition" });

  const indexPath = path.join(projectPath, "index.html");
  await writeFile(
    indexPath,
    buildIndexHtml(input, scenes, audioAssets, expectedRenderedVideoPath),
    "utf8",
  );
  files.push({ path: indexPath, purpose: "index" });

  const hyperframesJsonPath = path.join(projectPath, "hyperframes.json");
  await writeFile(hyperframesJsonPath, buildHyperframesJson(), "utf8");
  files.push({ path: hyperframesJsonPath, purpose: "hyperframes_config" });

  const packageJsonPath = path.join(projectPath, "package.json");
  await writeFile(packageJsonPath, buildPackageJson(input.project_slug), "utf8");
  files.push({ path: packageJsonPath, purpose: "package_manifest" });

  const publishCopyPath = path.join(projectPath, "publish-copy.txt");
  await writeFile(publishCopyPath, buildPublishCopy(input.blueprint), "utf8");
  files.push({ path: publishCopyPath, purpose: "publish_copy" });

  const qualityGatePath = path.join(projectPath, "QUALITY_GATES.json");
  await writeFile(
    qualityGatePath,
    `${JSON.stringify(
      {
        aspect: "1080x1920",
        duration_seconds: input.blueprint.duration_seconds,
        scene_count: input.blueprint.storyboard.length,
        subtitle_mode: "sentence_chunks",
        expected_rendered_video_path: expectedRenderedVideoPath,
        quality_gates: input.blueprint.render_plan.quality_gates,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  files.push({ path: qualityGatePath, purpose: "quality_gate" });

  return files;
}

async function copySceneAssets(
  input: HistoricalHyperFramesComposerParsedInput,
  projectRoot: string,
  projectPath: string,
): Promise<LocalScene[]> {
  const assetByScene = new Map(
    input.scene_assets.map((asset) => [asset.scene_id, asset.path] as const),
  );
  const localScenes: LocalScene[] = [];

  for (const [index, scene] of input.blueprint.storyboard.entries()) {
    const source = assetByScene.get(scene.scene_id);
    if (!source) {
      continue;
    }
    const sourcePath = resolveFromProjectRoot(projectRoot, source);
    const safeSceneId = safeFileName(scene.scene_id).toLowerCase();
    const fileBase = `${String(index + 1).padStart(2, "0")}-${safeSceneId}`;
    const copiedImagePath = path.join(
      projectPath,
      "assets",
      "images",
      "scenes",
      `${fileBase}${path.extname(sourcePath) || ".png"}`,
    );
    await copyFile(sourcePath, copiedImagePath);
    localScenes.push({
      scene,
      imageSrc: toHtmlPath(path.relative(projectPath, copiedImagePath)),
      fileName: `${fileBase}.html`,
      compositionId: fileBase,
      copiedImagePath,
    });
  }

  return localScenes;
}

async function copyAudioAssets(
  input: HistoricalHyperFramesComposerParsedInput,
  projectRoot: string,
  projectPath: string,
): Promise<{
  voice: Array<{ sceneId: string; src: string; startOffsetSeconds: number }>;
  bgm: string | undefined;
  sfx: Array<{
    id: string;
    src: string;
    startSecond: number;
    durationSeconds: number;
    volume: number;
  }>;
  files: GeneratedFile[];
}> {
  const files: GeneratedFile[] = [];
  const voice: Array<{
    sceneId: string;
    src: string;
    startOffsetSeconds: number;
  }> = [];

  for (const [index, clip] of input.voice_clips.entries()) {
    const sourcePath = resolveFromProjectRoot(projectRoot, clip.path);
    const targetPath = path.join(
      projectPath,
      "assets",
      "audio",
      "voice",
      `${String(index + 1).padStart(2, "0")}${path.extname(sourcePath)}`,
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    files.push({ path: targetPath, purpose: "copied_asset" });
    voice.push({
      sceneId: clip.scene_id,
      src: toHtmlPath(path.relative(projectPath, targetPath)),
      startOffsetSeconds: clip.start_offset_seconds,
    });
  }

  let bgm: string | undefined;
  if (input.bgm_path) {
    const sourcePath = resolveFromProjectRoot(projectRoot, input.bgm_path);
    const targetPath = path.join(
      projectPath,
      "assets",
      "audio",
      "bgm",
      `bgm${path.extname(sourcePath)}`,
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    files.push({ path: targetPath, purpose: "copied_asset" });
    bgm = toHtmlPath(path.relative(projectPath, targetPath));
  }

  const sfx = [];
  for (const clip of input.sfx_clips) {
    const sourcePath = resolveFromProjectRoot(projectRoot, clip.path);
    const targetPath = path.join(
      projectPath,
      "assets",
      "audio",
      "sfx",
      `${safeFileName(clip.id)}${path.extname(sourcePath)}`,
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    files.push({ path: targetPath, purpose: "copied_asset" });
    sfx.push({
      id: clip.id,
      src: toHtmlPath(path.relative(projectPath, targetPath)),
      startSecond: clip.start_second,
      durationSeconds: clip.duration_seconds,
      volume: clip.volume,
    });
  }

  return { voice, bgm, sfx, files };
}

async function copyOptionalFont(
  projectRoot: string,
  candidates: string[],
  targetPath: string,
  files: GeneratedFile[],
): Promise<void> {
  const source = candidates
    .map((candidate) => path.resolve(projectRoot, candidate))
    .find((candidate) => existsSync(candidate));
  if (!source) {
    return;
  }
  await copyFile(source, targetPath);
  files.push({ path: targetPath, purpose: "copied_asset" });
}

function buildSceneHtml(
  localScene: LocalScene,
  blueprint: HistoricalShortVideoOutput,
): string {
  const { scene, imageSrc, compositionId } = localScene;
  const duration = scene.end_second - scene.start_second;
  const sceneDomId = `scene-${compositionId}`;
  const titleLines = splitTitle(scene.scene_title, blueprint.topic)
    .map((line) => `<span>${escapeHtml(line)}</span>`)
    .join("");

  return `<!DOCTYPE html><html><head></head><body><template>
  <style>
    @font-face{font-family:"Noto Sans SC Local";src:url("../../assets/fonts/NotoSansSC-VF.ttf") format("truetype");font-weight:100 900}
    @font-face{font-family:"Noto Serif SC Local";src:url("../../assets/fonts/NotoSerifSC-VF.ttf") format("truetype");font-weight:100 900}
    #root{position:absolute;inset:0;width:1080px;height:1920px;overflow:hidden;background:#111619;color:#f3ead8}
    .camera{position:absolute;inset:-64px;will-change:transform}
    .plate{width:100%;height:100%;object-fit:cover}
    .grade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,15,18,.08),rgba(10,15,18,.12) 43%,rgba(10,15,18,.82)),radial-gradient(circle at 50% 32%,transparent 0 28%,rgba(10,15,18,.48) 84%)}
    .rule{position:absolute;left:70px;right:70px;top:160px;height:2px;background:linear-gradient(90deg,#d8b05b,rgba(216,176,91,0));transform-origin:left center}
    .label{position:absolute;top:100px;left:70px;z-index:3;padding:8px 14px;background:rgba(10,15,18,.64);color:#d4c19a;font:800 30px "Noto Sans SC Local","Microsoft YaHei",sans-serif;letter-spacing:.14em;text-shadow:0 3px 14px rgba(10,15,18,.85)}
    .label:before{content:"";display:inline-block;width:11px;height:11px;margin-right:14px;background:#d8b05b;transform:rotate(45deg)}
    .title{position:absolute;left:68px;top:218px;z-index:3;width:910px;font:900 118px/1.15 "Noto Serif SC Local","Microsoft YaHei",serif;letter-spacing:.02em;text-shadow:0 11px 38px rgba(10,15,18,.82)}
    .title span{display:block}
    .sub{position:absolute;left:76px;top:552px;z-index:3;max-width:900px;padding:12px 18px;background:rgba(17,22,25,.52);color:#f3ead8;font:800 40px/1.24 "Noto Sans SC Local","Microsoft YaHei",sans-serif;letter-spacing:.02em;text-shadow:0 3px 14px rgba(10,15,18,.85)}
    .detail{position:absolute;right:66px;top:688px;z-index:3;display:flex;flex-direction:column;gap:14px;align-items:flex-end}
    .detail b{display:block;padding:13px 18px;border:2px solid rgba(216,176,91,.56);background:rgba(28,34,37,.62);color:#f3ead8;font:800 30px/1.1 "Noto Sans SC Local","Microsoft YaHei",sans-serif;letter-spacing:.05em;box-shadow:0 12px 34px rgba(10,15,18,.3)}
    .seal{position:absolute;right:80px;top:116px;z-index:3;width:118px;height:118px;border:3px solid rgba(216,176,91,.58);border-radius:50%;box-shadow:0 0 0 12px rgba(143,52,46,.2);opacity:.85}
    .seal:after{content:"";position:absolute;inset:24px;border:2px solid rgba(216,176,91,.72);border-radius:50%}
  </style>
  <div id="root" data-composition-id="${compositionId}" data-width="1080" data-height="1920" data-duration="${duration}">
    <div class="camera" id="${sceneDomId}-camera" data-layout-allow-overflow><img class="plate" src="../../${imageSrc}" alt="${escapeHtml(scene.scene_title)}"></div>
    <div class="grade"></div>
    <div class="rule" id="${sceneDomId}-rule"></div>
    <div class="label" id="${sceneDomId}-label">${escapeHtml(scene.on_screen_detail)}</div>
    <div class="seal" id="${sceneDomId}-seal" data-layout-ignore></div>
    <div class="title" id="${sceneDomId}-title">${titleLines}</div>
    <div class="sub" id="${sceneDomId}-sub">${escapeHtml(scene.caption)}</div>
    <div class="detail" id="${sceneDomId}-detail"><b>${escapeHtml(scene.story_role)}</b><b>${escapeHtml(scene.sfx)}</b></div>
  </div>
  <script>
    window.__timelines=window.__timelines||{};
    const tl=gsap.timeline({paused:true});
    tl.fromTo("#${sceneDomId}-camera",{scale:1.035,x:-22,y:14},{scale:1.105,x:22,y:-18,duration:${duration},ease:"power1.inOut"},0);
    tl.fromTo("#${sceneDomId}-rule",{scaleX:0,opacity:.4},{scaleX:1,opacity:1,duration:.72,ease:"power3.out"},.18);
    tl.fromTo("#${sceneDomId}-label",{x:-34,opacity:0},{x:0,opacity:1,duration:.52,ease:"power3.out"},.24);
    tl.fromTo("#${sceneDomId}-seal",{scale:.72,rotation:-12,opacity:0},{scale:1,rotation:0,opacity:.85,duration:.68,ease:"back.out(1.8)"},.46);
    tl.fromTo("#${sceneDomId}-title span",{y:52,opacity:0},{y:0,opacity:1,duration:.72,stagger:.14,ease:"power3.out"},.56);
    tl.fromTo("#${sceneDomId}-sub",{y:24,opacity:0},{y:0,opacity:1,duration:.62,ease:"power2.out"},1.18);
    tl.fromTo("#${sceneDomId}-detail b",{x:42,opacity:0},{x:0,opacity:1,duration:.52,stagger:.15,ease:"power2.out"},1.7);
    tl.to(["#${sceneDomId}-title","#${sceneDomId}-sub","#${sceneDomId}-detail"],{opacity:0,y:-18,duration:.48,ease:"power1.in"},${Math.max(duration - 0.7, 2)});
    window.__timelines["${compositionId}"]=tl;
  </script>
</template></body></html>
`;
}

function buildCaptionsHtml(blueprint: HistoricalShortVideoOutput): string {
  const captionNodes = blueprint.subtitle_plan
    .map(
      (caption, index) =>
        `<div class="caption" id="caption-${index + 1}"><span>${highlightCaption(
          caption.text,
          blueprint,
        )}</span></div>`,
    )
    .join("\n    ");
  const cueData = JSON.stringify(
    blueprint.subtitle_plan.map((caption, index) => [
      `#caption-${index + 1}`,
      caption.start_second,
      caption.end_second - caption.start_second,
    ]),
  );

  return `<!DOCTYPE html><html><head></head><body><template>
  <style>
    @font-face{font-family:"Noto Sans SC Local";src:url("../assets/fonts/NotoSansSC-VF.ttf") format("truetype");font-weight:100 900}
    #root{position:absolute;inset:0;width:1080px;height:1920px;overflow:hidden}
    .caption{position:absolute;left:62px;right:62px;bottom:214px;display:flex;justify-content:center;opacity:0}
    .caption span{display:inline-block;max-width:956px;padding:18px 28px 22px;border-radius:10px;background:linear-gradient(90deg,rgba(10,15,18,.94),rgba(10,15,18,.74));color:#f3ead8;font:800 52px/1.38 "Noto Sans SC Local","Microsoft YaHei",sans-serif;letter-spacing:0;text-align:center;text-shadow:0 3px 10px rgba(10,15,18,.8);box-shadow:0 12px 38px rgba(10,15,18,.26)}
    .caption em{color:#d8b05b;font-style:normal}
    .caption strong{color:#d8b05b;font-weight:900}
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1920" data-duration="${blueprint.duration_seconds}">
    ${captionNodes}
  </div>
  <script>
    window.__timelines=window.__timelines||{};
    const tl=gsap.timeline({paused:true});
    const cues=${cueData};
    cues.forEach(([selector,start,duration])=>{
      tl.fromTo(selector,{opacity:0,y:18},{opacity:1,y:0,duration:.2,ease:"power2.out"},start);
      tl.to(selector,{opacity:1,duration:Math.max(.1,duration-.4),ease:"none"},start+.2);
      tl.to(selector,{opacity:0,y:-8,duration:.2,ease:"power1.in"},start+duration-.2);
    });
    window.__timelines.captions=tl;
  </script>
</template></body></html>
`;
}

function buildIndexHtml(
  input: HistoricalHyperFramesComposerParsedInput,
  scenes: LocalScene[],
  audioAssets: Awaited<ReturnType<typeof copyAudioAssets>>,
  expectedRenderedVideoPath: string,
): string {
  const sceneSlots = scenes
    .map(
      (localScene, index) =>
        `      <div id="el-scene-${String(index + 1).padStart(2, "0")}" class="scene-slot clip" data-composition-id="${localScene.compositionId}" data-composition-src="compositions/frames/${localScene.fileName}" data-start="${localScene.scene.start_second}" data-duration="${localScene.scene.end_second - localScene.scene.start_second}" data-track-index="1" data-width="1080" data-height="1920"></div>`,
    )
    .join("\n");
  const voiceByScene = new Map(
    audioAssets.voice.map((clip) => [clip.sceneId, clip] as const),
  );
  const voiceTracks = input.blueprint.storyboard
    .map((scene, index) => {
      const clip = voiceByScene.get(scene.scene_id);
      if (!clip) {
        return undefined;
      }
      return `      <audio id="voice-${String(index + 1).padStart(2, "0")}" src="${clip.src}" data-start="${scene.start_second + clip.startOffsetSeconds}" data-duration="${Math.max(scene.end_second - scene.start_second - 0.6, 0.2)}" data-track-index="10" data-volume="1"></audio>`;
    })
    .filter((line): line is string => line !== undefined)
    .join("\n");
  const bgmTrack = audioAssets.bgm
    ? `      <audio id="el-bgm" src="${audioAssets.bgm}" data-start="0" data-duration="${input.blueprint.duration_seconds}" data-track-index="11" data-volume="1"></audio>`
    : "";
  const sfxTracks = audioAssets.sfx
    .map(
      (clip) =>
        `      <audio id="sfx-${safeFileName(clip.id)}" src="${clip.src}" data-start="${clip.startSecond}" data-duration="${clip.durationSeconds}" data-track-index="20" data-volume="${clip.volume}"></audio>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN" data-resolution="portrait">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>${escapeHtml(input.blueprint.short_title)}</title>
    <script src="assets/vendor/gsap-3.14.2.min.js"></script>
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#111619}
      #root{position:relative;width:1080px;height:1920px;overflow:hidden;background:#111619}
      .scene-slot{position:absolute;inset:0;width:100%;height:100%}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="${input.blueprint.duration_seconds}" data-render-target="${escapeHtml(expectedRenderedVideoPath)}">
${sceneSlots}
      <div id="el-captions" class="scene-slot clip" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${input.blueprint.duration_seconds}" data-track-index="2" data-width="1080" data-height="1920"></div>

${voiceTracks}
${bgmTrack}
${sfxTracks}
    </div>
    <script>
      window.__timelines=window.__timelines||{};
      const tl=gsap.timeline({paused:true});
      ${audioAssets.bgm ? `tl.set("#el-bgm",{volume:.038},0);tl.to("#el-bgm",{volume:0,duration:2.8,ease:"power1.in"},${Math.max(input.blueprint.duration_seconds - 2.8, 0)});` : ""}
      window.__timelines.main=tl;
    </script>
  </body>
</html>
`;
}

function buildBlockingItems(
  input: HistoricalHyperFramesComposerParsedInput,
  projectRoot: string,
  projectPath: string,
): string[] {
  const blockingItems: string[] = [];
  const storyboardSceneIds = new Set(
    input.blueprint.storyboard.map((scene) => scene.scene_id),
  );
  const assetByScene = new Map(
    input.scene_assets.map((asset) => [asset.scene_id, asset.path] as const),
  );

  for (const scene of input.blueprint.storyboard) {
    const assetPath = assetByScene.get(scene.scene_id);
    if (!assetPath) {
      blockingItems.push(`缺少分镜素材：${scene.scene_id}`);
      continue;
    }
    const resolved = resolveFromProjectRoot(projectRoot, assetPath);
    if (!existsSync(resolved)) {
      blockingItems.push(`分镜素材不存在：${resolved}`);
    }
  }

  for (const asset of input.scene_assets) {
    if (!storyboardSceneIds.has(asset.scene_id)) {
      blockingItems.push(`素材引用了不存在的分镜：${asset.scene_id}`);
    }
  }

  for (const clip of input.voice_clips) {
    const resolved = resolveFromProjectRoot(projectRoot, clip.path);
    if (!storyboardSceneIds.has(clip.scene_id)) {
      blockingItems.push(`配音引用了不存在的分镜：${clip.scene_id}`);
    }
    if (!existsSync(resolved)) {
      blockingItems.push(`配音文件不存在：${resolved}`);
    }
  }

  if (input.bgm_path) {
    const resolved = resolveFromProjectRoot(projectRoot, input.bgm_path);
    if (!existsSync(resolved)) {
      blockingItems.push(`BGM 文件不存在：${resolved}`);
    }
  }

  for (const clip of input.sfx_clips) {
    const resolved = resolveFromProjectRoot(projectRoot, clip.path);
    if (!existsSync(resolved)) {
      blockingItems.push(`音效文件不存在：${resolved}`);
    }
  }

  const compositionTargets = [
    path.join(projectPath, "index.html"),
    path.join(projectPath, "compositions", "captions.html"),
  ];
  if (
    !input.overwrite_existing_composition &&
    compositionTargets.some((target) => existsSync(target))
  ) {
    blockingItems.push(
      "目标项目已存在 HyperFrames composition；如需重写，传入 overwrite_existing_composition=true。",
    );
  }

  const gsapSource = gsapSourceCandidates
    .map((candidate) => path.resolve(projectRoot, candidate))
    .find((candidate) => existsSync(candidate));
  if (!gsapSource) {
    blockingItems.push("未找到本地 GSAP 运行时资产。");
  }

  return blockingItems;
}

function buildWarnings(
  input: HistoricalHyperFramesComposerParsedInput,
): string[] {
  const warnings: string[] = [];
  if (input.voice_clips.length === 0) {
    warnings.push("未提供分镜配音，生成项目只能作为视觉预览。");
  }
  if (!input.bgm_path) {
    warnings.push("未提供 BGM，成片缺少底层情绪铺垫。");
  }
  if (input.sfx_clips.length < 3) {
    warnings.push("音效数量少于 3 个，转场和关键动作可能偏平。");
  }
  return warnings;
}

function buildRenderCommands(
  projectPath: string,
  expectedRenderedVideoPath: string,
  blueprint: HistoricalShortVideoOutput,
): HistoricalHyperFramesComposerOutput["render_commands"] {
  const midpointList = blueprint.storyboard
    .map((scene) => (scene.start_second + scene.end_second) / 2)
    .map((second) => Number(second.toFixed(2)))
    .join(",");
  const quotedProjectPath = quoteCommandArgument(projectPath);
  return {
    check: `cd ${quotedProjectPath}; npx hyperframes check`,
    snapshot: `cd ${quotedProjectPath}; npx hyperframes snapshot --at ${midpointList}`,
    render: `cd ${quotedProjectPath}; npx hyperframes render --quality high --output ${quoteCommandArgument(expectedRenderedVideoPath)}`,
  };
}

function buildHyperframesJson(): string {
  return `${JSON.stringify(
    {
      $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
      registry:
        "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
      paths: {
        blocks: "compositions",
        components: "compositions/components",
        assets: "assets",
      },
      media: {
        autoProxy: true,
      },
      authoringSkill: "faceless-explainer",
    },
    null,
    2,
  )}\n`;
}

function buildPackageJson(projectSlug: string): string {
  return `${JSON.stringify(
    {
      name: projectSlug,
      private: true,
      type: "module",
      scripts: {
        check: "npx --yes hyperframes@0.8.29 check",
        render: "npx --yes hyperframes@0.8.29 render",
        preview: "npx --yes hyperframes@0.8.29 preview",
      },
    },
    null,
    2,
  )}\n`;
}

function buildPublishCopy(blueprint: HistoricalShortVideoOutput): string {
  return `${blueprint.publish_copy.description}\n\n${blueprint.publish_copy.hashtags.join(" ")}\n`;
}

function findFirstExisting(projectRoot: string, candidates: string[]): string {
  const resolved = candidates
    .map((candidate) => path.resolve(projectRoot, candidate))
    .find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error("No candidate asset exists.");
  }
  return resolved;
}

function resolveFromProjectRoot(projectRoot: string, value: string): string {
  return path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(projectRoot, value);
}

function assertInsideDirectory(parent: string, child: string): void {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Resolved project path escapes videos directory: ${child}`);
  }
}

function quoteCommandArgument(value: string): string {
  return `"${value.replace(/"/gu, '\\"')}"`;
}

function safeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "")
    .replace(/\s+/gu, "-")
    .trim();
  return sanitized || "video";
}

function toHtmlPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function splitTitle(sceneTitle: string, topic: string): string[] {
  if (sceneTitle.length <= 5) {
    return [topic.slice(0, 6), sceneTitle];
  }
  return [sceneTitle.slice(0, 5), sceneTitle.slice(5, 10)].filter(Boolean);
}

function highlightCaption(
  caption: string,
  blueprint: HistoricalShortVideoOutput,
): string {
  let escaped = escapeHtml(caption);
  for (const token of extractHighlightTokens(blueprint)) {
    escaped = escaped.replace(
      escapeHtml(token),
      `<strong>${escapeHtml(token)}</strong>`,
    );
  }
  return escaped;
}

function extractHighlightTokens(blueprint: HistoricalShortVideoOutput): string[] {
  return [
    blueprint.topic,
    ...blueprint.strategic_takeaway.match(/[\u4e00-\u9fff]{4,8}/gu) ?? [],
    ...blueprint.core_conflict.match(/[\u4e00-\u9fff]{4,8}/gu) ?? [],
  ].slice(0, 4);
}
