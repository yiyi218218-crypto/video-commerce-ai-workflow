import { AgentContractConsistencyError } from "../../errors.js";
import {
  accountIncubationInputSchema,
  accountIncubationOutputSchema,
  type AccountIncubationInput,
  type AccountIncubationOutput,
} from "../../schemas/account-incubation.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

const commercialLanguage = /下单|橱窗|佣金|优惠券|到手价|购买|带货|限时/;

export class AccountIncubationAgent extends PromptAgent<
  AccountIncubationInput,
  AccountIncubationOutput
> {
  readonly name = "account_incubation_agent";
  readonly inputSchema = accountIncubationInputSchema;
  readonly outputSchema = accountIncubationOutputSchema;
  readonly prompt = {
    id: "account_incubation_agent",
    version: "1.1.0",
    file: new URL("../../prompts/account-incubation-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(
    input: AccountIncubationInput,
  ): Promise<AccountIncubationOutput> {
    const output = await super.run(input);
    const windowIds = new Set(
      input.profile.launch_cadence.publish_windows.map((window) => window.id),
    );
    const expectedDays = new Set([1, 2, 3, 4, 5, 6, 7]);
    const seenTitles = new Set<string>();

    for (const day of output.first_week_schedule) {
      if (!expectedDays.delete(day.day)) {
        throw new AgentContractConsistencyError(this.name, "The weekly schedule has duplicate days.");
      }
      const scheduledWindows = new Set(day.slots.map((slot) => slot.publish_window_id));
      if (scheduledWindows.size !== day.slots.length) {
        throw new AgentContractConsistencyError(this.name, "Each day must use distinct publish windows.");
      }
      for (const slot of day.slots) {
        if (!windowIds.has(slot.publish_window_id)) {
          throw new AgentContractConsistencyError(this.name, "The schedule uses an unavailable publish window.");
        }
      }
    }
    if (expectedDays.size > 0) {
      throw new AgentContractConsistencyError(this.name, "The weekly schedule must cover days one through seven.");
    }

    for (const video of output.launch_videos) {
      if (seenTitles.has(video.title)) {
        throw new AgentContractConsistencyError(this.name, "Launch video titles must be distinct.");
      }
      seenTitles.add(video.title);
      if (!windowIds.has(video.publish_window_id)) {
        throw new AgentContractConsistencyError(this.name, "A launch video uses an unavailable publish window.");
      }
      assertTimeline(this.name, video.beats);
      const commercialCopy = [
        video.title,
        video.cover_text,
        video.hook,
        video.viewer_problem,
        video.core_insight,
        video.actionable_takeaway,
        video.story_promise,
        video.caption,
        video.comment_prompt,
        ...video.beats.flatMap((beat) => [beat.narration, beat.on_screen_text]),
      ].join(" ");
      if (commercialLanguage.test(commercialCopy)) {
        throw new AgentContractConsistencyError(
          this.name,
          "Account incubation content must not contain sales language.",
        );
      }
      assertContentValue(this.name, video);
    }
    return output;
  }
}

function assertContentValue(
  agentName: string,
  video: {
    viewer_problem: string;
    core_insight: string;
    actionable_takeaway: string;
  },
): void {
  const values = [video.viewer_problem, video.core_insight, video.actionable_takeaway];
  if (values.some((value) => value.startsWith("需要重新生成："))) {
    throw new AgentContractConsistencyError(
      agentName,
      "Every launch video must state the viewer problem, a concrete insight, and an actionable takeaway.",
    );
  }
  if (new Set(values.map((value) => value.trim())).size !== values.length) {
    throw new AgentContractConsistencyError(
      agentName,
      "Viewer problem, core insight, and actionable takeaway must be distinct.",
    );
  }
}

function assertTimeline(
  agentName: string,
  beats: ReadonlyArray<{ start_second: number; end_second: number }>,
): void {
  let previousEnd = 0;
  for (const beat of beats) {
    if (beat.start_second !== previousEnd || beat.end_second <= beat.start_second) {
      throw new AgentContractConsistencyError(agentName, "A launch video must have a contiguous timeline.");
    }
    previousEnd = beat.end_second;
  }
  if (previousEnd !== 15) {
    throw new AgentContractConsistencyError(agentName, "A launch video must end at fifteen seconds.");
  }
}
