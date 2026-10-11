"use client";

import { CheckCircle2, LoaderCircle, Sparkles, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { middleAgedLifestyleOperationProfile } from "../presets/middle-aged-lifestyle-operation.js";
import {
  accountIncubationOutputSchema,
  type AccountIncubationInput,
  type AccountIncubationOutput,
} from "../schemas/account-incubation.schema.js";
import type { WorkflowRun } from "../schemas/workflow-run.schema.js";
import {
  executeAccountIncubationWorkflow,
  listCodexJobs,
  WorkflowApiError,
} from "../web/workflow-api-client.js";

const launchContext = {
  presenter: "账号本人",
  accessible_scenes: ["厨房操作台", "家庭餐桌", "玄关", "阳台"],
  available_capture_methods: ["phone", "tripod", "voice_over"],
  first_week_goal: "account_tag",
} satisfies AccountIncubationInput["launch_context"];

export function AccountIncubationWorkbench({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const plan = useMemo(() => parsePlan(run), [run]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const jobs = await listCodexJobs();
        const latest = jobs.find(
          (job) => job.status === "completed" && job.run?.workflow === "account_incubation",
        );
        if (active && latest?.run) {
          setRun(latest.run);
        }
      } catch {
        // The workbench stays usable even when the local job history is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createPlan() {
    setBusy(true);
    setError(null);
    try {
      const nextRun = await executeAccountIncubationWorkflow({
        action: "start",
        input: {
          profile: middleAgedLifestyleOperationProfile,
          launch_context: launchContext,
        },
      });
      setRun(nextRun);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="selection-workbench" id="account-incubation">
      <div className="selection-heading">
        <div>
          <span className="step-label">01 · 账号冷启动</span>
          <h2>先完成第一周内容，不挂商品</h2>
          <p>
            以真实家庭生活建立账号标签。一次生成 7 天 × 3 个选题，以及第一天可审片的 3 条 15 秒视频分镜。
          </p>
        </div>
        <span className="selection-status">非带货阶段</span>
      </div>

      <div className="selection-autopilot">
        <div>
          <strong>默认创作条件</strong>
          <p>账号本人 · 手机/三脚架 · 厨房、餐桌、玄关、阳台 · 只用自有、授权或生成素材</p>
        </div>
        <button
          className="primary-button"
          disabled={!enabled || busy}
          onClick={() => void createPlan()}
          type="button"
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
          {busy ? "正在生成首周内容" : enabled ? "生成第一周内容" : "等待本机 Codex"}
        </button>
      </div>

      {error && <p className="console-error" role="alert">{error}</p>}

      {!plan ? (
        <div className="history-empty">
          <Video size={20} />
          <span>不涉及商品、佣金、橱窗或下单；生成后先审脚本与素材清单，再进入 HyperFrames 成片制作。</span>
        </div>
      ) : (
        <div className="creative-review-grid">
          <article className="creative-review-card">
            <span className="step-label">账号承诺</span>
            <h3>{plan.profile_setup.display_name}</h3>
            <p>{plan.account_promise}</p>
            <p>{plan.profile_setup.bio}</p>
            <ul className="selling-point-list">
              {plan.content_pillars.map((pillar) => (
                <li key={pillar.name}>
                  <strong>{pillar.name}</strong>：{pillar.content_boundary}
                </li>
              ))}
            </ul>
          </article>
          <article className="creative-review-card">
            <span className="step-label">首周排期</span>
            <h3>7 天内容节奏</h3>
            <ul className="selling-point-list">
              {plan.first_week_schedule.map((day) => (
                <li key={day.day}>
                  <strong>第 {day.day} 天</strong>：{day.slots.map((slot) => slot.topic).join(" / ")}
                </li>
              ))}
            </ul>
          </article>
          <article className="creative-review-card">
            <span className="step-label">发布前门禁</span>
            <h3>先审片，再发布</h3>
            <ul className="selling-point-list">
              {plan.review_checklist.map((item) => (
                <li key={item}><CheckCircle2 size={13} />{item}</li>
              ))}
            </ul>
          </article>
        </div>
      )}

      {plan && (
        <div className="selection-ranking" aria-label="首日视频生产包">
          {plan.launch_videos.map((video) => (
            <article key={video.video_id}>
              <div className="ranking-index">{video.video_id.slice(-1)}</div>
              <div>
                <span className="recommendation-badge">{video.publish_window_id}</span>
                <h3>{video.title}</h3>
                <p><strong>封面：</strong>{video.cover_text}　<strong>钩子：</strong>{video.hook}</p>
                <p><strong>观众问题：</strong>{video.viewer_problem}</p>
                <p><strong>核心判断：</strong>{video.core_insight}</p>
                <p><strong>看完带走：</strong>{video.actionable_takeaway}</p>
                <ul className="selling-point-list">
                  {video.beats.map((beat) => (
                    <li key={beat.start_second}>
                      <strong>{beat.start_second}–{beat.end_second}秒</strong> {beat.visual} · {beat.on_screen_text}
                    </li>
                  ))}
                </ul>
                <p><strong>素材：</strong>{video.asset_checklist.join("；")}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function parsePlan(run: WorkflowRun | null): AccountIncubationOutput | null {
  if (!run) {
    return null;
  }
  const parsed = accountIncubationOutputSchema.safeParse(run.artifacts.incubation_plan);
  return parsed.success ? parsed.data : null;
}

function toUserMessage(error: unknown): string {
  if (error instanceof WorkflowApiError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "首周内容生成失败，请稍后重试。";
}
