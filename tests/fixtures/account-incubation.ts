import type {
  AccountIncubationInput,
  AccountIncubationOutput,
} from "../../src/schemas/account-incubation.schema.js";
import { middleAgedLifestyleOperationProfile } from "../../src/presets/middle-aged-lifestyle-operation.js";

const windowIds = ["early_morning", "midday", "evening"] as const;

export const sampleAccountIncubationInput = {
  profile: middleAgedLifestyleOperationProfile,
  launch_context: {
    presenter: "account owner",
    accessible_scenes: ["kitchen", "dining table", "entryway"],
    available_capture_methods: ["phone", "tripod", "voice_over"],
    first_week_goal: "account_tag",
  },
} satisfies AccountIncubationInput;

function scheduleDay(day: number) {
  return {
    day,
    daily_theme: `household rhythm ${day}`,
    slots: windowIds.map((publish_window_id, index) => ({
      publish_window_id,
      pillar_name: ["household rhythm", "family care", "small habits"][index]!,
      topic: `original topic ${day}-${index + 1}`,
      audience_question: `question ${day}-${index + 1}`,
      learning_hypothesis: "Observe whether this real-life scene earns completion and comments.",
    })),
  };
}

function launchVideo(
  number: 1 | 2 | 3,
  publishWindowId: (typeof windowIds)[number],
) {
  return {
    video_id: `launch-${number}` as const,
    publish_window_id: publishWindowId,
    content_pillar: ["household rhythm", "family care", "small habits"][number - 1]!,
    title: `A household moment ${number}`,
    cover_text: `Moment ${number}`,
    hook: `A familiar household moment ${number}.`,
    viewer_problem: "A household task repeatedly becomes inconvenient because it has no clear place in the routine.",
    core_insight: "The problem is usually the missing landing point in the sequence, not a lack of effort.",
    actionable_takeaway: "Give the next repeated action one visible landing point and test it for a week.",
    story_promise: "Use one real action to make a small household observation feel useful.",
    beats: [
      { start_second: 0, end_second: 3, visual: "A hand pauses at a cluttered household task.", narration: "This always slows me down.", on_screen_text: "Gets stuck", transition: "cut" as const },
      { start_second: 3, end_second: 6, visual: "The owner notices the order of the task.", narration: "Then I changed just one step.", on_screen_text: "Small change", transition: "match_cut" as const },
      { start_second: 6, end_second: 9, visual: "A simple household action is completed.", narration: "It became easier to keep up.", on_screen_text: "Easier to keep", transition: "cut" as const },
      { start_second: 9, end_second: 12, visual: "A close view of the calm result.", narration: "Nothing fancy, just more comfortable.", on_screen_text: "Feels calmer", transition: "hold" as const },
      { start_second: 12, end_second: 15, visual: "The scene settles into a warm wide shot.", narration: "What small thing makes your home easier?", on_screen_text: "Your habit?", transition: "sound_bridge" as const },
    ],
    caption: "One real household action, recorded without selling anything.",
    comment_prompt: "What is one small habit that helps at home?",
    bgm_direction: "Warm, unobtrusive acoustic music below a natural spoken voice.",
    asset_checklist: ["self-shot home scene", "phone close-up", "natural voice recording", "licensed or generated BGM"],
    status: "needs_real_assets" as const,
    commercial_state: "non_commercial" as const,
  };
}

export const sampleAccountIncubationOutput = {
  account_promise: "A real-person household account about small routines that make family life feel easier.",
  profile_setup: {
    display_name: "Warm Home Notes",
    bio: "Real household routines and small family moments, one day at a time.",
    visual_direction: "Warm home light, clear subject, one useful action per frame, and restrained text.",
  },
  content_pillars: [
    { name: "household rhythm", audience_need: "A calmer daily flow at home.", content_boundary: "One household routine per story.", proof_style: "Show the complete action in a real scene." },
    { name: "family care", audience_need: "Small moments of being considerate.", content_boundary: "Family interaction without moral lectures.", proof_style: "Use one observable gesture and natural dialogue." },
    { name: "small habits", audience_need: "Simple ideas that are easy to remember.", content_boundary: "No broad life advice or unsupported claims.", proof_style: "Show what happened before and after one action." },
  ],
  first_week_schedule: Array.from({ length: 7 }, (_, index) => scheduleDay(index + 1)),
  launch_videos: [
    launchVideo(1, "early_morning"),
    launchVideo(2, "midday"),
    launchVideo(3, "evening"),
  ],
  review_checklist: [
    "Confirm every visual is self-shot, licensed, or generated with a recorded source.",
    "Confirm the scene contains no unsupported factual claim.",
    "Confirm cover and subtitles remain inside the vertical safe area.",
    "Confirm narration is natural and music remains below speech.",
    "Require a human to review the cut before publication.",
  ],
  commercial_boundary: {
    sales_enabled: false,
    prohibited_actions: ["No product placement", "No sales call to action", "No paid growth activity"],
    next_review_trigger: "Review the first seven days after enough completed videos and comments have been collected.",
  },
} satisfies AccountIncubationOutput;
