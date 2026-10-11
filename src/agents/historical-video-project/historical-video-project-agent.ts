import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AgentInputValidationError } from "../../errors.js";
import {
  historicalVideoProjectAgentInputSchema,
  historicalVideoProjectAgentOutputSchema,
  type HistoricalVideoProjectAgentInput,
  type HistoricalVideoProjectAgentOutput,
} from "../../schemas/historical-video-project-agent.schema.js";
import type { HistoricalShortVideoOutput } from "../../schemas/historical-short-video-agent.schema.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import type { AgentDescriptor, ContractAgent } from "../agent.js";

interface HistoricalVideoProjectAgentOptions {
  projectRoot?: string;
}

interface ScaffoldFile {
  relativePath: string;
  purpose: HistoricalVideoProjectAgentOutput["files"][number]["purpose"];
  description: string;
  content: string;
}

export class HistoricalVideoProjectAgent
  implements
    ContractAgent<
      HistoricalVideoProjectAgentInput,
      HistoricalVideoProjectAgentOutput
    >
{
  readonly name = "historical_video_project_agent";
  readonly inputSchema = historicalVideoProjectAgentInputSchema;
  readonly outputSchema = historicalVideoProjectAgentOutputSchema;
  readonly prompt = {
    id: "historical_video_project_agent",
    version: "1.0.0",
    file: new URL(
      "../../prompts/historical-video-project-agent.md",
      import.meta.url,
    ),
  };

  constructor(
    private readonly options: HistoricalVideoProjectAgentOptions = {},
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
    rawInput: HistoricalVideoProjectAgentInput,
  ): Promise<HistoricalVideoProjectAgentOutput> {
    const parsed = this.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AgentInputValidationError(this.name, parsed.error.issues);
    }

    const input = parsed.data;
    const projectRoot = path.resolve(
      input.project_root ?? this.options.projectRoot ?? process.cwd(),
    );
    const videosRoot = path.resolve(projectRoot, "videos");
    const projectPath = path.resolve(videosRoot, input.project_slug);
    assertInsideDirectory(videosRoot, projectPath);

    const publishCopyPath = path.join(projectPath, "publish-copy.txt");
    const expectedRenderedVideoPath = path.join(
      projectPath,
      "renders",
      `${safeFileName(input.blueprint.short_title)}-发布版.mp4`,
    );
    const renderCommands = buildRenderCommands(
      projectPath,
      expectedRenderedVideoPath,
    );
    const publishBridge = {
      compatible_agent: "wechat_channel_publisher_agent" as const,
      publish_copy_file: publishCopyPath,
      expected_rendered_video_path: expectedRenderedVideoPath,
      prepare_publish_job_command: buildPreparePublishJobCommand(
        expectedRenderedVideoPath,
        input.blueprint.short_title,
        publishCopyPath,
      ),
    };

    if (existsSync(projectPath) && !input.overwrite_existing_scaffold) {
      return this.outputSchema.parse({
        status: "blocked",
        project_slug: input.project_slug,
        project_path: projectPath,
        files: [],
        render_commands: renderCommands,
        publish_bridge: publishBridge,
        next_steps: [
          "换一个 project_slug，或明确传入 overwrite_existing_scaffold=true 覆盖已知脚手架文件。",
        ],
        blocking_items: [`项目目录已存在：${projectPath}`],
      });
    }

    const scaffoldFiles = buildScaffoldFiles(input.blueprint);
    await mkdir(projectPath, { recursive: true });
    await mkdir(path.join(projectPath, "assets"), { recursive: true });
    await mkdir(path.join(projectPath, "renders"), { recursive: true });

    for (const file of scaffoldFiles) {
      await writeFile(
        path.join(projectPath, file.relativePath),
        file.content,
        "utf8",
      );
    }

    return this.outputSchema.parse({
      status: "created",
      project_slug: input.project_slug,
      project_path: projectPath,
      files: scaffoldFiles.map((file) => ({
        path: path.join(projectPath, file.relativePath),
        purpose: file.purpose,
        description: file.description,
      })),
      render_commands: renderCommands,
      publish_bridge: publishBridge,
      next_steps: [
        "按 STORYBOARD.md 补齐或生成每个分镜的独立画面素材。",
        "使用 SCRIPT.md 生成平稳男声配音，字幕必须按 subtitle_plan 分句。",
        "初始化 HyperFrames 项目并将 frame.md 的视觉规范落到 index.html。",
        "渲染后用 ffprobe 和关键帧截图检查画面、字幕、音频和比例。",
        "确认成片后，用 publish_bridge 的命令生成微信视频号发布任务。",
      ],
      blocking_items: [],
    });
  }
}

function buildScaffoldFiles(
  blueprint: HistoricalShortVideoOutput,
): ScaffoldFile[] {
  return [
    {
      relativePath: "BRIEF.md",
      purpose: "brief",
      description: "给 HyperFrames 和制作 Agent 使用的创作简报。",
      content: buildBriefMarkdown(blueprint),
    },
    {
      relativePath: "SCRIPT.md",
      purpose: "script",
      description: "完整旁白、字幕分句和配音要求。",
      content: buildScriptMarkdown(blueprint),
    },
    {
      relativePath: "STORYBOARD.md",
      purpose: "storyboard",
      description: "逐镜头分镜、画面提示词、运镜和音效。",
      content: buildStoryboardMarkdown(blueprint),
    },
    {
      relativePath: "frame.md",
      purpose: "frame",
      description: "竖屏画面、字体、字幕、安全区和动效规范。",
      content: buildFrameMarkdown(blueprint),
    },
    {
      relativePath: "publish-copy.txt",
      purpose: "publish_copy",
      description: "微信视频号发布描述与话题标签。",
      content: buildPublishCopy(blueprint),
    },
    {
      relativePath: "production-plan.json",
      purpose: "production_plan",
      description: "机器可读的完整生产计划。",
      content: `${JSON.stringify(
        {
          schema: "video-commerce-ai/historical-video-project@1.0.0",
          created_at: new Date().toISOString(),
          blueprint,
        },
        null,
        2,
      )}\n`,
    },
  ];
}

function buildBriefMarkdown(blueprint: HistoricalShortVideoOutput): string {
  return `# ${blueprint.short_title}

## 内容定位

- 方向：${blueprint.lane}
- 时长：${blueprint.duration_seconds} 秒
- 冷开场：${blueprint.cold_open}
- 一句话承诺：${blueprint.one_sentence_promise}
- 核心冲突：${blueprint.core_conflict}
- 结尾观点：${blueprint.strategic_takeaway}

## 历史口径

${blueprint.uncertainty_notes.map((note) => `- ${note}`).join("\n")}

## 必查资料

${blueprint.sources_to_check
  .map(
    (source) =>
      `- ${source.source_name}：${source.claim_to_check}（${source.use_in_video}）`,
  )
  .join("\n")}

## 制作边界

${blueprint.render_plan.quality_gates.map((gate) => `- ${gate}`).join("\n")}
`;
}

function buildScriptMarkdown(blueprint: HistoricalShortVideoOutput): string {
  return `# SCRIPT

## 配音设定

- 声音：${blueprint.narration.voice_profile}
- 账号固定基准：黄袍加身模板｜zh-CN-YunxiNeural｜rate +8%｜pitch -4Hz
- 语气：${blueprint.narration.tone}
- 混音：${blueprint.audio_plan.voice_mix}
- 节奏：完整语义句，句间自然停顿；冲突关键词、关键动作和结尾疑问略加重。
- 禁止：切换声线、新闻播报腔、预告片式重音、逐字卡拉 OK、拖慢语速。

## 完整旁白

${blueprint.narration.full_script}

## 字幕分句

${blueprint.subtitle_plan
  .map(
    (caption) =>
      `- ${formatRange(caption.start_second, caption.end_second)} ${caption.text}`,
  )
  .join("\n")}
`;
}

function buildStoryboardMarkdown(
  blueprint: HistoricalShortVideoOutput,
): string {
  const rows = blueprint.storyboard
    .map(
      (scene) =>
        `| ${scene.scene_id} | ${formatRange(
          scene.start_second,
          scene.end_second,
        )} | ${escapeTableCell(scene.scene_title)} | ${escapeTableCell(
          scene.story_role,
        )} | ${escapeTableCell(scene.caption)} | ${escapeTableCell(
          scene.visual_prompt,
        )} | ${scene.camera_motion} | ${escapeTableCell(
          scene.on_screen_detail,
        )} | ${escapeTableCell(scene.sfx)} |`,
    )
    .join("\n");

  return `# STORYBOARD

| ID | 时间 | 镜头标题 | 叙事作用 | 字幕 | 画面提示 | 运镜 | 屏幕细节 | 音效 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## 画面要求

- 每个分镜必须使用不同画面素材，禁止一张图反复裁切冒充多镜头。
- 地图、时间线、关系图只能作为辅助层，不作为主画面堆叠。
- 字幕按整句或短句出现，不做逐字卡拉 OK。
`;
}

function buildFrameMarkdown(blueprint: HistoricalShortVideoOutput): string {
  return `# frame.md

## 基础规格

- 画幅：${blueprint.render_plan.target_resolution}，${blueprint.render_plan.format}
- 引擎：${blueprint.render_plan.engine}
- 视觉风格：克制电影感历史短剧，低饱和，暖烛光/冷夜色对比。
- 字幕：底部安全区内，整句分段，最多两行，避免遮挡主体。

## 动效策略

- 主镜头只使用 slow_push_in、slow_pan、parallax_drift、detail_reveal 这类低强度运动。
- 转场使用轻微暗场、烛火遮罩或纸张擦拭，不使用杂乱地图飞线。
- 关键文字只强调名词和转折句，不堆满屏信息。

## 音频策略

- BGM：${blueprint.audio_plan.bgm_direction}
- 配音：固定使用黄袍加身基准男声 zh-CN-YunxiNeural，rate +8%、pitch -4Hz；普通话、纪录片口吻，避免紧迫感和推销感。
- 节奏：完整语义句，句间保留自然停顿；冲突关键词、关键动作和结尾疑问略加重。
- 音效：${blueprint.audio_plan.sfx_cues.join("、")}
`;
}

function buildPublishCopy(blueprint: HistoricalShortVideoOutput): string {
  const hashtags = blueprint.publish_copy.hashtags.join(" ");
  return `${blueprint.publish_copy.description}\n\n${hashtags}\n`;
}

function buildRenderCommands(
  projectPath: string,
  expectedRenderedVideoPath: string,
): HistoricalVideoProjectAgentOutput["render_commands"] {
  const quotedProjectPath = quoteCommandArgument(projectPath);
  return {
    initialize_hyperframes: `cd ${quotedProjectPath}; npx hyperframes init .`,
    check: `cd ${quotedProjectPath}; npx hyperframes check`,
    render: `npm run hf:stable-render -- --project-dir ${quotedProjectPath} --output ${quoteCommandArgument(
      expectedRenderedVideoPath,
    )} --quality standard`,
  };
}

function buildPreparePublishJobCommand(
  expectedRenderedVideoPath: string,
  shortTitle: string,
  publishCopyPath: string,
): string {
  return [
    "npm run channel:prepare-job --",
    `--video-path ${quoteCommandArgument(expectedRenderedVideoPath)}`,
    `--short-title ${quoteCommandArgument(shortTitle)}`,
    `--description-file ${quoteCommandArgument(publishCopyPath)}`,
    "--confirm-publish",
  ].join(" ");
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
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "").trim();
}

function formatRange(start: number, end: number): string {
  return `${formatSecond(start)}-${formatSecond(end)}`;
}

function formatSecond(value: number): string {
  return `${Math.round(value)}s`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}
