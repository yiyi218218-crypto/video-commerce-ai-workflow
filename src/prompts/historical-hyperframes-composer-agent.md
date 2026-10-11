# Historical HyperFrames Composer Agent

This deterministic agent converts a validated historical short-video blueprint plus a local asset manifest into a renderable HyperFrames project.

It owns the engineering handoff between content planning and rendering:

- Verify each storyboard scene has a real, distinct local image asset.
- Copy scene images, optional voice clips, BGM, SFX, fonts, and GSAP into the project.
- Generate `index.html`, per-scene frame compositions, caption composition, `hyperframes.json`, `package.json`, `publish-copy.txt`, and `QUALITY_GATES.json`.
- Preserve the user's quality constraints: 9:16, sentence-level captions, multiple distinct scenes, calm historical pacing, and AI disclosure in publish copy.
- For historical account videos, default to `historical_short_drama_cinematic_v1` from `docs/historical-short-video-style-guide.md`.
- Use the locked voice profile `data/voice-profiles/historical-yunxi-story-cn.json` for every new historical account video:
  `zh-CN-YunxiNeural`, rate `+8%`, pitch `-4Hz`, complete semantic sentences, natural pauses.
  Reject or regenerate voice assets that use a different voice, hurried delivery, or slow dragged-out pacing.
- Do not build a final historical video as a CSS-only/vector/info-graphic explainer unless the user explicitly asks for that style.

It does not invent historical claims, scrape private platform data, publish externally, or call private WeChat APIs. Publishing is handled later by `wechat_channel_publisher_agent`.
