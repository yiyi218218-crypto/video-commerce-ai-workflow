import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AgentInputValidationError } from "../../errors.js";
import {
  weChatChannelPublisherInputSchema,
  weChatChannelPublisherOutputSchema,
  type WeChatChannelPublisherInput,
  type WeChatChannelPublisherJob,
  type WeChatChannelPublisherOutput,
} from "../../schemas/wechat-channel-publisher-agent.schema.js";
import { findTopicDuplicates } from "../../services/publishing/topic-duplication.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import type { AgentDescriptor, ContractAgent } from "../agent.js";

interface WeChatChannelPublisherAgentOptions {
  projectRoot?: string;
}

const defaultChannelName = "星轨潮汐.";
const defaultJobRelativePath = path.join(
  "data",
  "channel-publisher",
  "current-job.json",
);

export class WeChatChannelPublisherAgent
  implements
    ContractAgent<
      WeChatChannelPublisherInput,
      WeChatChannelPublisherOutput
    >
{
  readonly name = "wechat_channel_publisher_agent";
  readonly inputSchema = weChatChannelPublisherInputSchema;
  readonly outputSchema = weChatChannelPublisherOutputSchema;
  readonly prompt = {
    id: "wechat_channel_publisher_agent",
    version: "1.0.0",
    file: new URL(
      "../../prompts/wechat-channel-publisher-agent.md",
      import.meta.url,
    ),
  };

  constructor(
    private readonly options: WeChatChannelPublisherAgentOptions = {},
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
    rawInput: WeChatChannelPublisherInput,
  ): Promise<WeChatChannelPublisherOutput> {
    const parsed = this.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AgentInputValidationError(this.name, parsed.error.issues);
    }

    const input = parsed.data;
    const projectRoot = path.resolve(
      input.project_root ?? this.options.projectRoot ?? process.cwd(),
    );
    const videoPath = resolveFromProjectRoot(projectRoot, input.video_path);
    const jobFilePath = resolveFromProjectRoot(
      projectRoot,
      input.job_file_path ?? defaultJobRelativePath,
    );
    const expectedChannelName =
      input.expected_channel_name?.trim() ?? defaultChannelName;
    const aiGenerated = input.ai_generated ?? true;
    const confirmPublish = input.confirm_publish ?? false;

    const job: WeChatChannelPublisherJob = {
      videoPath: toPortablePath(videoPath),
      shortTitle: input.short_title.trim(),
      description: input.description.trim(),
      expectedChannelName,
      aiGenerated,
      confirmPublish,
    };

    const duplicateMatches = findTopicDuplicates(
      `${job.shortTitle}\n${job.description}`,
      input.recent_published_texts,
    );
    const duplicateCheck = {
      policy: input.duplicate_policy,
      checked: input.recent_published_texts.length > 0,
      matches: duplicateMatches,
    };
    const blockingItems = buildBlockingItems(videoPath);
    if (input.duplicate_policy === "block" && duplicateMatches.length > 0) {
      blockingItems.push(
        `疑似重复选题：与近期内容共享 ${duplicateMatches[0]?.shared_terms.join(
          "、",
        )}`,
      );
    }
    const warnings = buildWarnings(job, duplicateMatches);

    if (blockingItems.length === 0) {
      await mkdir(path.dirname(jobFilePath), { recursive: true });
      await writeFile(
        jobFilePath,
        `${JSON.stringify(job, null, 2)}\n`,
        "utf8",
      );
    }

    const output: WeChatChannelPublisherOutput = {
      status: blockingItems.length === 0 ? "ready" : "blocked",
      job_file_path: jobFilePath,
      job,
      commands: {
        prepare: buildPublishCommand("prepare", jobFilePath, projectRoot),
        publish: buildPublishCommand("publish", jobFilePath, projectRoot),
      },
      safety_checks: {
        expected_channel_name: expectedChannelName,
        location_policy: "不显示位置",
        ai_disclosure_required: aiGenerated,
        product_link_policy: "none_unless_explicitly_requested",
        auth_policy: "browser_login_or_visible_qr_only",
      },
      duplicate_check: duplicateCheck,
      blocking_items: blockingItems,
      warnings,
    };

    return this.outputSchema.parse(output);
  }
}

function resolveFromProjectRoot(projectRoot: string, value: string): string {
  return path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(projectRoot, value);
}

function toPortablePath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function buildBlockingItems(videoPath: string): string[] {
  return existsSync(videoPath)
    ? []
    : [`视频文件不存在：${videoPath}`];
}

function buildWarnings(
  job: WeChatChannelPublisherJob,
  duplicateMatches: ReturnType<typeof findTopicDuplicates>,
): string[] {
  const warnings: string[] = [];
  if (job.aiGenerated && !/AI|人工智能|AIGC|辅助创作/iu.test(job.description)) {
    warnings.push("AI 生成内容建议在描述中明确说明。");
  }
  if (!/#/u.test(job.description)) {
    warnings.push("描述中没有话题标签，可能影响内容分发。");
  }
  if (job.expectedChannelName !== defaultChannelName) {
    warnings.push(
      `目标视频号不是默认账号 ${defaultChannelName}，发布前必须重新核验账号。`,
    );
  }
  if (duplicateMatches.length > 0) {
    warnings.push(
      `疑似重复选题：与近期内容共享 ${duplicateMatches[0]?.shared_terms.join(
        "、",
      )}。`,
    );
  }
  return warnings;
}

function buildPublishCommand(
  action: "prepare" | "publish",
  jobFilePath: string,
  projectRoot: string,
): string {
  const defaultJobPath = path.resolve(projectRoot, defaultJobRelativePath);
  const jobOption =
    path.resolve(jobFilePath) === defaultJobPath
      ? ""
      : ` --job ${quoteCommandArgument(jobFilePath)}`;
  return `npm run publish:wechat -- --action ${action}${jobOption}`;
}

function quoteCommandArgument(value: string): string {
  return `"${value.replace(/"/gu, '\\"')}"`;
}
