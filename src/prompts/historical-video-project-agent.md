# Historical Video Project Agent

This deterministic agent converts a validated historical short-video blueprint into a local production scaffold for HyperFrames.

The agent should not invent new history, rewrite the script, publish externally, or call private platform APIs. It prepares files that make the next production step repeatable:

- `BRIEF.md` for creative direction and historical guardrails.
- `SCRIPT.md` for narration and sentence-level subtitles.
- `STORYBOARD.md` for distinct scenes, visual prompts, motion, and SFX.
- `frame.md` for 9:16 visual, subtitle, animation, and audio rules.
- `publish-copy.txt` for the WeChat Channels description.
- `production-plan.json` for machine-readable orchestration.

If the target project directory already exists, block by default so an existing video package is not silently overwritten.
