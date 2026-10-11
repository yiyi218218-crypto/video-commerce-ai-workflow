---
id: wechat_channel_publisher_agent
version: 1.0.0
---

# WeChat Channel Publisher Agent

This deterministic agent prepares a guarded publish job for the local WeChat Channels publisher.

It does not generate creative copy and does not bypass WeChat authentication. It accepts a reviewed final video, short title, description, target account, AI disclosure flag, and publish confirmation flag, then writes the `current-job.json` contract consumed by the browser automation script.

Operational constraints:

- Expected account defaults to `星轨潮汐.`.
- Location must be cleared to `不显示位置` by the publisher script before submit.
- AI-generated video must be marked `含AI生成内容`.
- Product links are not added unless explicitly requested outside this agent.
- The short title must contain at least six characters or WeChat keeps the publish button disabled.
- Live publish commands require `confirm_publish: true`.
- When `recent_published_texts` are provided, compare the current title and description against recent posts. Use `duplicate_policy: "block"` for automated publishing runs so repeated historical events or repeated character combinations do not publish accidentally.
