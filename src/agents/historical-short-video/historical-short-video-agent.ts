import {
  AgentContractConsistencyError,
  AgentInputValidationError,
} from "../../errors.js";
import {
  historicalShortVideoInputSchema,
  historicalShortVideoOutputSchema,
  type HistoricalShortVideoInput,
  type HistoricalShortVideoOutput,
} from "../../schemas/historical-short-video-agent.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

const salesLanguage =
  /下单|到手价|佣金|优惠券|购买|橱窗|带货|限时|立即抢|联系客服/u;

export class HistoricalShortVideoAgent extends PromptAgent<
  HistoricalShortVideoInput,
  HistoricalShortVideoOutput
> {
  readonly name = "historical_short_video_agent";
  readonly inputSchema = historicalShortVideoInputSchema;
  readonly outputSchema = historicalShortVideoOutputSchema;
  readonly prompt = {
    id: "historical_short_video_agent",
    version: "1.0.0",
    file: new URL(
      "../../prompts/historical-short-video-agent.md",
      import.meta.url,
    ),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(
    rawInput: HistoricalShortVideoInput,
  ): Promise<HistoricalShortVideoOutput> {
    const parsedInput = this.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new AgentInputValidationError(this.name, parsedInput.error.issues);
    }
    const input = parsedInput.data;
    const output = await super.run(input);
    assertRequestedShape(this.name, input, output);
    assertTimeline(this.name, output.duration_seconds, output.storyboard);
    assertTimeline(this.name, output.duration_seconds, output.subtitle_plan);
    assertDistinctVisuals(this.name, output.storyboard);
    assertNonCommercial(this.name, output);
    assertCaptionsAreSentenceChunks(this.name, output);
    assertQualityGates(this.name, output);
    return output;
  }
}

function assertRequestedShape(
  agentName: string,
  input: HistoricalShortVideoInput,
  output: HistoricalShortVideoOutput,
): void {
  if (output.duration_seconds !== input.duration_seconds) {
    throw new AgentContractConsistencyError(
      agentName,
      "Output duration must match the requested duration.",
    );
  }
  if (output.lane !== input.lane) {
    throw new AgentContractConsistencyError(
      agentName,
      "Output lane must match the requested content lane.",
    );
  }
  if (output.narration.voice_profile !== input.style.narrator_voice) {
    throw new AgentContractConsistencyError(
      agentName,
      "Narration voice profile must match the requested narrator voice.",
    );
  }
}

function assertTimeline(
  agentName: string,
  duration: number,
  items: ReadonlyArray<{ start_second: number; end_second: number }>,
): void {
  let previousEnd = 0;
  for (const item of items) {
    if (Math.abs(item.start_second - previousEnd) > 0.01) {
      throw new AgentContractConsistencyError(
        agentName,
        "Timeline must be contiguous from zero.",
      );
    }
    if (item.end_second <= item.start_second) {
      throw new AgentContractConsistencyError(
        agentName,
        "Timeline item end_second must be greater than start_second.",
      );
    }
    previousEnd = item.end_second;
  }
  if (Math.abs(previousEnd - duration) > 0.01) {
    throw new AgentContractConsistencyError(
      agentName,
      "Timeline must end at the requested duration.",
    );
  }
}

function assertDistinctVisuals(
  agentName: string,
  scenes: HistoricalShortVideoOutput["storyboard"],
): void {
  const normalizedPrompts = scenes.map((scene) =>
    scene.visual_prompt.replace(/\s+/gu, "").toLowerCase(),
  );
  if (new Set(normalizedPrompts).size !== normalizedPrompts.length) {
    throw new AgentContractConsistencyError(
      agentName,
      "Storyboard visual prompts must be distinct.",
    );
  }
}

function assertNonCommercial(
  agentName: string,
  output: HistoricalShortVideoOutput,
): void {
  const joined = [
    output.short_title,
    output.cold_open,
    output.one_sentence_promise,
    output.core_conflict,
    output.strategic_takeaway,
    output.narration.full_script,
    output.publish_copy.description,
    ...output.storyboard.flatMap((scene) => [
      scene.scene_title,
      scene.narration,
      scene.caption,
      scene.on_screen_detail,
    ]),
  ].join(" ");
  if (salesLanguage.test(joined)) {
    throw new AgentContractConsistencyError(
      agentName,
      "Account-growth historical content must not contain sales language.",
    );
  }
}

function assertCaptionsAreSentenceChunks(
  agentName: string,
  output: HistoricalShortVideoOutput,
): void {
  if (output.subtitle_plan.some((caption) => caption.text.length <= 1)) {
    throw new AgentContractConsistencyError(
      agentName,
      "Subtitles must use sentence or phrase chunks, not single characters.",
    );
  }
  if (
    output.subtitle_plan.some((caption) =>
      /\s/u.test(caption.text.replace(/[，。！？、：；“”]/gu, "")),
    )
  ) {
    throw new AgentContractConsistencyError(
      agentName,
      "Chinese subtitle chunks should not rely on spaced karaoke text.",
    );
  }
}

function assertQualityGates(
  agentName: string,
  output: HistoricalShortVideoOutput,
): void {
  const gates = output.render_plan.quality_gates.join(" ");
  const requiredPatterns = [
    /不重复|重复/u,
    /字幕|caption/i,
    /音频|配音|BGM|声音/i,
    /9[:：]?16|1080x1920/u,
    /AI|人工智能|AIGC/u,
  ];
  for (const pattern of requiredPatterns) {
    if (!pattern.test(gates)) {
      throw new AgentContractConsistencyError(
        agentName,
        "Quality gates must cover visuals, subtitles, audio, format, and AI disclosure.",
      );
    }
  }
}
