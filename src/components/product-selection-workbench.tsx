"use client";

import {
  Bot,
  Check,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProductVideoProject } from "../schemas/product-video-project.schema.js";
import type {
  SelectionAnalysisProfile,
  SelectionBatch,
  SelectionRecommendation,
} from "../schemas/product-selection.schema.js";
import {
  analyzeSelectionBatch,
  listSelectionBatches,
  openSelectionBridgeDirectory,
  ProductSelectionApiError,
  waitForSelectionAnalysis,
} from "../web/product-selection-api-client.js";
import {
  autoCreateProductVideos,
  openProductVideoProjectDirectory,
  productVideoRenderedUrl,
  renderProductVideoProject,
  submitProductVideoProduction,
  waitForProductVideoProduction,
} from "../web/product-video-api-client.js";

const selectionCenterUrl =
  "https://store.weixin.qq.com/talent/home";
const profileStorageKey =
  "video-commerce-ai.product-selection-profile.v2";
const channelProfileStorageKey =
  "video-commerce-ai.channel-publish-profile.v1";

interface ProfileForm {
  channelName: string;
  targetAudiences: string;
  preferredCategories: string;
  excludedKeywords: string;
  contentStrengths: string;
  minimumCommissionRate: string;
  minimumPrice: string;
  maximumPrice: string;
}

const baselineProfile: ProfileForm = {
  channelName: "",
  targetAudiences: "关注实用好物与高性价比的微信视频号用户",
  preferredCategories: "",
  excludedKeywords: "医疗功效\n仿冒\n虚假稀缺",
  contentStrengths: "故事化讲解\n真实使用场景\n手机自然拍摄",
  minimumCommissionRate: "",
  minimumPrice: "",
  maximumPrice: "",
};

const initialProfile: ProfileForm = {
  ...baselineProfile,
  targetAudiences:
    "50+家庭生活决策者\n为父母挑选实用居家好物的子女\n重视省心、规格清楚与售后保障的家庭用户",
  preferredCategories: "家居清洁\n收纳\n厨房工具\n家庭食品\n节日礼赠",
  excludedKeywords:
    "医疗功效\n治疗承诺\n仿冒\n虚假稀缺\n未经核验的低价\n夸大转化",
  contentStrengths:
    "真实家庭生活场景\n具体使用动作\n规格与适用条件核验\n口语化经验分享",
};

export function ProductSelectionWorkbench({
  localMode,
}: {
  localMode: boolean;
}) {
  const [profile, setProfile] = useState<ProfileForm>(initialProfile);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [batches, setBatches] = useState<SelectionBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<
    "load" | "analyze" | "autopilot" | "extension" | "video" | "folder" | null
  >(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(
    null,
  );
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoProject, setVideoProject] =
    useState<ProductVideoProject | null>(null);
  const [autoVideoProjects, setAutoVideoProjects] = useState<
    ProductVideoProject[]
  >([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recoveryAbortRef = useRef<AbortController | null>(null);
  const autopilotStartedRef = useRef(false);

  const activeBatch =
    batches.find((batch) => batch.id === activeBatchId) ??
    batches[0] ??
    null;
  const rankedCandidates = activeBatch?.analysis?.ranking ?? [];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(profileStorageKey);
      if (saved) {
        setProfile((current) => ({
          ...current,
          ...(JSON.parse(saved) as Partial<ProfileForm>),
        }));
      } else {
        const channelSaved = window.localStorage.getItem(
          channelProfileStorageKey,
        );
        if (channelSaved) {
          const value = JSON.parse(channelSaved) as {
            channelDisplayName?: unknown;
          };
          const channelName = value.channelDisplayName;
          if (typeof channelName === "string") {
            setProfile((current) => ({
              ...current,
              channelName,
            }));
          }
        }
      }
    } catch {
      window.localStorage.removeItem(profileStorageKey);
    } finally {
      setProfileHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!localMode) {
      return;
    }
    void refreshBatches();
    return () => {
      recoveryAbortRef.current?.abort();
    };
  }, [localMode]);

  useEffect(() => {
    setVideoProject(null);
    setAutoVideoProjects([]);
    setVideoProgress(0);
    setMessage(null);
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [activeBatchId]);

  useEffect(() => {
    if (
      !localMode ||
      !profileHydrated ||
      !activeBatch ||
      autopilotStartedRef.current ||
      new URLSearchParams(window.location.search).get("autopilot") !== "1"
    ) {
      return;
    }
    autopilotStartedRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("autopilot");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (!profile.channelName.trim()) {
      setError("候选商品已自动导入；请先填写视频号名称后再启动 AI 选品。");
      return;
    }
    void handleAutopilotRun();
  }, [activeBatch?.id, localMode, profile.channelName, profileHydrated]);

  useEffect(() => {
    const analysisProfile = batches.find(
      (batch) => batch.id === activeBatchId,
    )?.analysis_profile;
    if (!analysisProfile) {
      return;
    }
    setProfile({
      channelName: analysisProfile.channel_name,
      targetAudiences: analysisProfile.target_audiences.join("\n"),
      preferredCategories:
        analysisProfile.preferred_categories.join("\n"),
      excludedKeywords: analysisProfile.excluded_keywords.join("\n"),
      contentStrengths: analysisProfile.content_strengths.join("\n"),
      minimumCommissionRate:
        analysisProfile.minimum_commission_rate?.toString() ?? "",
      minimumPrice:
        analysisProfile.price_range?.minimum.toString() ?? "",
      maximumPrice:
        analysisProfile.price_range?.maximum.toString() ?? "",
    });
  }, [activeBatchId]);

  const recommendedCandidateNames = useMemo(
    () =>
      rankedCandidates
        .slice(0, 3)
        .map((item) => item.product_name)
        .join("、"),
    [rankedCandidates],
  );

  const autoEligibleCount = useMemo(
    () =>
      rankedCandidates.filter(
        (item) =>
          item.overall_score >= 70 &&
          (item.recommendation_level === "priority_test" ||
            item.recommendation_level === "small_test") &&
          item.dimensions.content_potential >= 14 &&
          item.dimensions.trust_and_safety >= 14 &&
          Boolean(
            activeBatch?.candidates.find(
              (candidate) => candidate.candidate_id === item.candidate_id,
            )?.image_url,
          ),
      ).length,
    [activeBatch?.candidates, rankedCandidates],
  );

  async function refreshBatches() {
    setBusy("load");
    setError(null);
    try {
      const loaded = await listSelectionBatches();
      setBatches(loaded);
      const requestedId = new URLSearchParams(
        window.location.search,
      ).get("selection_batch");
      const nextId =
        (requestedId &&
        loaded.some((batch) => batch.id === requestedId)
          ? requestedId
          : loaded[0]?.id) ?? null;
      setActiveBatchId(nextId);
      const pending = loaded.find(
        (batch) =>
          batch.id === nextId &&
          (batch.status === "queued" ||
            batch.status === "analyzing"),
      );
      if (pending) {
        void recoverAnalysis(pending.id);
      }
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function recoverAnalysis(batchId: string) {
    recoveryAbortRef.current?.abort();
    const controller = new AbortController();
    recoveryAbortRef.current = controller;
    setBusy("analyze");
    try {
      const completed = await waitForSelectionAnalysis(batchId, {
        signal: controller.signal,
        onProgress: updateBatchProgress,
      });
      replaceBatch(completed);
      setMessage("Codex 已完成选品排序。");
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(toUserMessage(caught));
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(null);
        setAnalysisProgress(null);
      }
    }
  }

  async function handleAnalyze() {
    if (!activeBatch) {
      return;
    }
    setBusy("analyze");
    setError(null);
    setMessage(null);
    setAnalysisProgress("正在提交 Codex 选品任务…");
    try {
      const analysisProfile = toAnalysisProfile(profile);
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify(profile),
      );
      const completed = await analyzeOrJoinBatch(
        activeBatch,
        analysisProfile,
      );
      setMessage(
        `选品完成。优先候选：${completed.analysis?.ranking[0]?.product_name ?? "请查看排名"}`,
      );
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
      setAnalysisProgress(null);
    }
  }

  async function handleOpenExtensionDirectory() {
    setBusy("extension");
    setError(null);
    try {
      await openSelectionBridgeDirectory();
      setMessage(
        "扩展目录已打开：在 chrome://extensions 开启开发者模式，然后加载该目录。",
      );
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoVideo(
    recommendation: SelectionRecommendation,
  ) {
    if (!activeBatch) {
      return;
    }
    setBusy("video");
    setError(null);
    setMessage("正在生成 HyperFrames 创意工程与 MP4 预览成片…");
    setVideoProgress(0.1);
    try {
      const job = await submitProductVideoProduction({
        batch_id: activeBatch.id,
        candidate_id: recommendation.candidate_id,
      });
      setMessage(`创意任务已进入队列（${job.id.slice(0, 8)}…），可安全在后台继续。`);
      setVideoProgress(0.2);
      const prepared = await waitForProductVideoProduction(job.id, {
        onStatus: (currentJob) => {
          if (currentJob.status === "running") {
            setVideoProgress((current) => Math.max(current, 0.45));
            setMessage("Codex 正在完成故事线、镜头动作、字幕节奏与声音设计…");
          }
        },
      });
      setVideoProject(prepared);
      setAutoVideoProjects([prepared]);
      setVideoProgress(1);
      setMessage(
        "创意提案已完成。请先审阅故事、镜头和待核验事实；确认一条路线且素材合格后，才生成 MP4。",
      );
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleAutoPilotVideos() {
    if (!activeBatch) {
      return;
    }
    setBusy("video");
    setError(null);
    setMessage("Codex 正在为最高潜商品生成三套不同的创意提案…");
    setVideoProgress(0);
    setAutoVideoProjects([]);
    try {
      const result = await autoCreateProductVideos(activeBatch.id, {
        maximum_projects: 1,
        minimum_score: 70,
        recommendation_levels: ["priority_test", "small_test"],
        creative_routes: ["life_problem", "real_test", "identity"],
        render: false,
        render_quality: "draft",
      });
      const firstProject = result.projects[0] ?? null;
      setAutoVideoProjects(result.projects);
      setVideoProject(firstProject);
      setVideoProgress(1);
      setMessage(
        result.projects.length > 0
          ? `已为“${result.projects[0]?.candidate.product_name ?? "优选商品"}”准备 ${result.projects.length} 套创意提案。请选择一条审片后再渲染。`
          : "未能生成可审阅的创意提案，请检查商品资料与素材。",
      );
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleAutopilotRun() {
    if (!activeBatch) {
      return;
    }
    setBusy("autopilot");
    setError(null);
    setMessage(null);
    setAnalysisProgress("Codex 正在比较候选商品的内容潜力与风险…");
    setVideoProgress(0.08);
    try {
      const analysisProfile = toAnalysisProfile(profile);
      window.localStorage.setItem(
        profileStorageKey,
        JSON.stringify(profile),
      );
      const completed = await analyzeOrJoinBatch(
        activeBatch,
        analysisProfile,
      );
      setAnalysisProgress("已选出优先商品，正在生成故事化创意与真实素材检查…");
      setVideoProgress(0.35);
      const result = await autoCreateProductVideos(completed.id, {
        maximum_projects: 1,
        minimum_score: 70,
        recommendation_levels: ["priority_test", "small_test"],
        creative_routes: ["life_problem", "real_test", "identity"],
        render: false,
        render_quality: "draft",
      });
      const project = result.projects[0] ?? null;
      setAutoVideoProjects(result.projects);
      setVideoProject(project);
      if (project) {
        setMessage(
          `已自动选中“${project.candidate.product_name}”，并生成三套不同的创意提案。请先选定一个故事方向；只有素材满足要求的方向才能进入 MP4 渲染。`,
        );
      }
      setVideoProgress(1);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
      setAnalysisProgress(null);
    }
  }

  async function handleRenderCreativeProposal(project: ProductVideoProject) {
    if (!canRenderCreativeProposal(project)) {
      setError("该创意仍缺少至少 4 张不同的真实商品或使用场景素材，不能渲染为发布级视频。");
      return;
    }
    setBusy("video");
    setError(null);
    setVideoProject(project);
    setVideoProgress(0.18);
    setMessage("已确认创意路线，HyperFrames 正在生成审片版 MP4…");
    try {
      const rendered = await renderProductVideoProject(project.id, {
        render_quality: "standard",
      });
      setVideoProject(rendered);
      setAutoVideoProjects((current) =>
        current.map((item) => (item.id === rendered.id ? rendered : item)),
      );
      setPreviewUrl(productVideoRenderedUrl(rendered.id));
      setVideoProgress(1);
      setMessage("审片版 MP4 已生成。请核对商品事实、字幕与画面后，再进入人工发布流程。");
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenVideoFolder() {
    if (!videoProject) {
      return;
    }
    setBusy("folder");
    setError(null);
    try {
      await openProductVideoProjectDirectory(videoProject.id);
      setMessage("已在资源管理器中打开自动成片项目。");
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function analyzeOrJoinBatch(
    batch: SelectionBatch,
    analysisProfile: SelectionAnalysisProfile,
  ): Promise<SelectionBatch> {
    if (batch.status === "queued" || batch.status === "analyzing") {
      setAnalysisProgress(
        batch.status === "queued"
          ? "已有 Codex 分析任务正在排队，已接管等待…"
          : "已有 Codex 分析正在运行，已接管等待结果…",
      );
      const completed = await waitForSelectionAnalysis(batch.id, {
        onProgress: updateBatchProgress,
      });
      replaceBatch(completed);
      return completed;
    }

    const queued = await analyzeSelectionBatch(batch.id, analysisProfile);
    replaceBatch(queued);
    const completed = await waitForSelectionAnalysis(batch.id, {
      onProgress: updateBatchProgress,
    });
    replaceBatch(completed);
    return completed;
  }

  function updateBatchProgress(batch: SelectionBatch) {
    replaceBatch(batch);
    setAnalysisProgress(
      batch.status === "queued"
        ? "等待本机 Codex…"
        : batch.status === "analyzing"
          ? "Codex 正在比较商品事实、佣金与内容潜力…"
          : "正在整理选品结果…",
    );
  }

  function replaceBatch(batch: SelectionBatch) {
    setBatches((current) => [
      batch,
      ...current.filter((item) => item.id !== batch.id),
    ]);
    setActiveBatchId(batch.id);
  }

  function updateProfile<Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="selection-workbench" id="product-selection">
      <div className="selection-heading">
        <div>
          <span className="section-kicker">
            WECHAT STORE · AI PRODUCT SELECTION
          </span>
          <h2>选品中心自动扫描 → Codex 自动选品 → 15 秒创意提案</h2>
          <p>
            在你已登录的选品中心点击“自动扫描并启动 AI 选品”，系统会读取当前公开可见商品卡，按账号匹配、需求证据、内容潜力与风险筛选。
          </p>
        </div>
        <div className="selection-heading-actions">
          <a
            className="secondary-button selection-link"
            href={selectionCenterUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={15} />
            打开选品中心
          </a>
          <button
            className="secondary-button"
            disabled={!localMode || busy !== null}
            onClick={() => void handleOpenExtensionDirectory()}
            type="button"
          >
            <PackageOpen size={15} />
            安装选品桥
          </button>
        </div>
      </div>

      <div className="selection-safety">
        选品桥只读取当前公开可见的商品卡；不会读取微信 Cookie、密码或调用页面私有接口。加入橱窗和发布仍需人工确认。
      </div>

      {!localMode ? (
        <div className="selection-empty">
          该功能只在 127.0.0.1 本机 Codex 模式中启用。
        </div>
      ) : (
        <div className="selection-layout">
          <aside className="selection-batches">
            <div className="selection-subheading">
              <span>候选批次</span>
              <button
                aria-label="刷新候选批次"
                disabled={busy !== null}
                onClick={() => void refreshBatches()}
                type="button"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            {batches.length === 0 ? (
              <div className="selection-batch-empty">
                <ShoppingBasket size={20} />
                <strong>还没有候选商品</strong>
                <span>
                  安装选品桥后，进入微信小店选品广场并点击“自动扫描并启动 AI 选品”。
                </span>
              </div>
            ) : (
              <div className="selection-batch-list">
                {batches.map((batch) => (
                  <button
                    className={
                      batch.id === activeBatch?.id ? "active" : ""
                    }
                    key={batch.id}
                    onClick={() => setActiveBatchId(batch.id)}
                    type="button"
                  >
                    <strong>{batch.candidates.length} 个候选</strong>
                    <span>{selectionStatusLabel(batch.status)}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="selection-main">
            {!activeBatch ? (
              <div className="selection-main-empty">
                <Bot size={27} />
                <h3>等待选品桥导入</h3>
                <p>
                  第一次使用请点击“安装选品桥”，然后在 Chrome 扩展页加载打开的目录；进入选品中心后点击扩展里的“自动扫描并启动 AI 选品”。
                </p>
              </div>
            ) : (
              <>
                <div className="selection-batch-summary">
                  <div>
                    <span>当前批次</span>
                    <strong>
                      {activeBatch.candidates.length} 个可见商品候选
                    </strong>
                  </div>
                  <span className={`selection-status ${activeBatch.status}`}>
                    {selectionStatusLabel(activeBatch.status)}
                  </span>
                </div>

                <div className="selection-profile-grid">
                  <SelectionField
                    label="视频号名称"
                    onChange={(value) =>
                      updateProfile("channelName", value)
                    }
                    value={profile.channelName}
                  />
                  <SelectionField
                    label="最低佣金率（可空）"
                    onChange={(value) =>
                      updateProfile("minimumCommissionRate", value)
                    }
                    suffix="%"
                    type="number"
                    value={profile.minimumCommissionRate}
                  />
                  <SelectionField
                    label="最低客单价（可空）"
                    onChange={(value) =>
                      updateProfile("minimumPrice", value)
                    }
                    suffix="元"
                    type="number"
                    value={profile.minimumPrice}
                  />
                  <SelectionField
                    label="最高客单价（可空）"
                    onChange={(value) =>
                      updateProfile("maximumPrice", value)
                    }
                    suffix="元"
                    type="number"
                    value={profile.maximumPrice}
                  />
                  <SelectionArea
                    label="目标用户（每行一个）"
                    onChange={(value) =>
                      updateProfile("targetAudiences", value)
                    }
                    value={profile.targetAudiences}
                  />
                  <SelectionArea
                    label="内容优势（每行一个）"
                    onChange={(value) =>
                      updateProfile("contentStrengths", value)
                    }
                    value={profile.contentStrengths}
                  />
                  <SelectionArea
                    label="偏好类目（可空）"
                    onChange={(value) =>
                      updateProfile("preferredCategories", value)
                    }
                    value={profile.preferredCategories}
                  />
                  <SelectionArea
                    label="排除关键词"
                    onChange={(value) =>
                      updateProfile("excludedKeywords", value)
                    }
                    value={profile.excludedKeywords}
                  />
                </div>

                <button
                  className="primary-button selection-analyze-button"
                  disabled={
                    busy !== null ||
                    profile.channelName.trim().length === 0
                  }
                  onClick={() => void handleAnalyze()}
                  type="button"
                >
                  {busy === "analyze" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  {busy === "analyze"
                    ? analysisProgress ?? "Codex 正在选品"
                    : activeBatch.status === "analyzed"
                      ? "重新分析当前候选"
                      : "让 Codex 选出优先商品"}
                </button>

                <div className="selection-autopilot">
                  <div>
                    <span>一键托管</span>
                    <strong>自动挑选 1 个最适合讲故事的商品</strong>
                    <p>
                      先筛内容潜力与风险，再生成分镜、字幕、配音与 BGM；素材不足时只交付创意包，不伪造视频成品。
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={
                      busy !== null ||
                      profile.channelName.trim().length === 0
                    }
                    onClick={() => void handleAutopilotRun()}
                    type="button"
                  >
                    {busy === "autopilot" ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {busy === "autopilot"
                      ? analysisProgress ?? "正在自动创作"
                      : "自动挑品并制作"}
                  </button>
                </div>

                {rankedCandidates.length > 0 && (
                  <div className="selection-ranking">
                    <div className="selection-ranking-heading">
                      <div>
                        <span>AI 选品结果</span>
                        <strong>{recommendedCandidateNames}</strong>
                      </div>
                      <small>
                        分数只代表当前账号的内容测试优先级
                      </small>
                    </div>
                    <div className="selection-recommendation-actions">
                      <button
                        disabled={busy !== null || autoEligibleCount === 0}
                        onClick={() => void handleAutoPilotVideos()}
                        type="button"
                      >
                        {busy === "video" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <Video size={14} />
                        )}
                        自动生成 Top3 成品
                      </button>
                    </div>
                    {rankedCandidates.map((recommendation, index) => (
                      <article
                        className={index === 0 ? "top-pick" : ""}
                        key={recommendation.candidate_id}
                      >
                        <div className="selection-rank">
                          <span>#{index + 1}</span>
                          <strong>{recommendation.overall_score}</strong>
                        </div>
                        <div className="selection-recommendation-copy">
                          <strong>{recommendation.product_name}</strong>
                          <p>{recommendation.reasons[0]}</p>
                          <div>
                            {recommendation.risk_flags
                              .slice(0, 2)
                              .map((risk) => (
                                <span key={risk}>{risk}</span>
                              ))}
                          </div>
                        </div>
                        <div className="selection-recommendation-actions">
                          {activeBatch.candidates.find(
                            (item) =>
                              item.candidate_id ===
                              recommendation.candidate_id,
                          )?.source_url && (
                            <a
                              href={
                                activeBatch.candidates.find(
                                  (item) =>
                                    item.candidate_id ===
                                    recommendation.candidate_id,
                                )?.source_url
                              }
                              rel="noreferrer"
                              target="_blank"
                            >
                              查看商品
                            </a>
                          )}
                          <button
                            disabled={busy !== null}
                            onClick={() =>
                              void handleAutoVideo(recommendation)
                            }
                            type="button"
                          >
                            <Video size={14} />
                            创意成片
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {busy === "video" && (
                  <div className="selection-video-progress">
                    <span
                      style={{
                        width: `${Math.round(videoProgress * 100)}%`,
                      }}
                    />
                    <strong>
                      实时合成 {Math.round(videoProgress * 100)}%
                    </strong>
                  </div>
                )}

                {previewUrl && (
                  <video
                    className="selection-video-preview"
                    controls
                    playsInline
                    src={previewUrl}
                  />
                )}

                {(autoVideoProjects.length > 0 ||
                  videoProject?.creative_production) && (
                  <section className="creative-review" aria-label="创意审片">
                    <div className="creative-review-heading">
                      <div>
                        <span>02 · 创意审片</span>
                        <strong>先选故事，再做视频</strong>
                        <p>
                          每套提案围绕同一商品的不同叙事逻辑展开；不通过素材与事实检查，不能渲染成发布级内容。
                        </p>
                      </div>
                      <small>人工确认必经步骤</small>
                    </div>
                    <div className="creative-review-grid">
                      {(autoVideoProjects.length > 0
                        ? autoVideoProjects
                        : videoProject
                          ? [videoProject]
                          : []
                      ).map((project) => {
                        const creative = project.creative_production;
                        if (!creative) {
                          return null;
                        }
                        const isSelected = project.id === videoProject?.id;
                        const renderReady = canRenderCreativeProposal(project);
                        return (
                          <article
                            className={isSelected ? "selected" : ""}
                            key={project.id}
                          >
                            <div className="creative-route-meta">
                              <span>{creativeRouteLabel(creative.creative_route)}</span>
                              <small>
                                {renderReady ? "素材已满足渲染" : "等待真实素材"}
                              </small>
                            </div>
                            <h3>{creative.display_name}</h3>
                            <p className="creative-promise">
                              {creative.one_sentence_promise}
                            </p>
                            <p className="creative-arc">
                              情绪节奏：{creative.emotional_arc}
                            </p>
                            <ol className="creative-beats">
                              {creative.beats.map((beat, index) => (
                                <li key={`${project.id}-${beat.start_second}`}>
                                  <span>{String(index + 1).padStart(2, "0")}</span>
                                  <div>
                                    <strong>{beat.on_screen_text}</strong>
                                    <p>{beat.action}</p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                            {creative.facts_to_verify.length > 0 && (
                              <div className="creative-fact-list">
                                <span>发布前核验</span>
                                <p>{creative.facts_to_verify.join("、")}</p>
                              </div>
                            )}
                            {!renderReady && (
                              <div className="creative-asset-list">
                                <span>还需补齐</span>
                                <p>
                                  {creative.asset_requirements
                                    .filter(
                                      (asset) =>
                                        asset.required && asset.kind !== "bgm",
                                    )
                                    .map((asset) => asset.purpose)
                                    .join("、")}
                                </p>
                              </div>
                            )}
                            <div className="creative-review-actions">
                              <button
                                className="secondary-button"
                                disabled={busy !== null}
                                onClick={() => setVideoProject(project)}
                                type="button"
                              >
                                查看这套方案
                              </button>
                              <button
                                className="primary-button"
                                disabled={busy !== null || !renderReady}
                                onClick={() =>
                                  void handleRenderCreativeProposal(project)
                                }
                                type="button"
                              >
                                <Video size={15} />
                                {project.rendered_video
                                  ? "查看已生成成片"
                                  : "确认方案并渲染"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                {videoProject?.status === "video_ready" && (
                  <div className="selection-video-result">
                    <div>
                      <Check size={18} />
                      <span>
                        <strong>15 秒竖屏成片已保存</strong>
                        <small>{videoProject.directory_path}</small>
                      </span>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={busy !== null}
                      onClick={() => void handleOpenVideoFolder()}
                      type="button"
                    >
                      <FolderOpen size={15} />
                      打开成片项目
                    </button>
                  </div>
                )}

              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="selection-error">{error}</div>}
      {message && <div className="selection-message">{message}</div>}
    </section>
  );
}

function SelectionField({
  label,
  value,
  onChange,
  type = "text",
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  suffix?: string;
}) {
  return (
    <label className="selection-field">
      <span>{label}</span>
      <div>
        <input
          onChange={(event) => onChange(event.target.value)}
          type={type}
          value={value}
        />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  );
}

function SelectionArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="selection-field">
      <span>{label}</span>
      <textarea
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function toAnalysisProfile(form: ProfileForm): SelectionAnalysisProfile {
  const minimumPrice = optionalNumber(form.minimumPrice);
  const maximumPrice = optionalNumber(form.maximumPrice);
  return {
    channel_name: requiredText(form.channelName, "视频号名称"),
    target_audiences: requiredLines(
      form.targetAudiences,
      "目标用户",
    ),
    preferred_categories: lines(form.preferredCategories),
    excluded_keywords: lines(form.excludedKeywords),
    content_strengths: requiredLines(
      form.contentStrengths,
      "内容优势",
    ),
    ...(form.minimumCommissionRate.trim()
      ? {
          minimum_commission_rate: Number(
            form.minimumCommissionRate,
          ),
        }
      : {}),
    ...(minimumPrice !== undefined && maximumPrice !== undefined
      ? {
          price_range: {
            minimum: minimumPrice,
            maximum: maximumPrice,
          },
        }
      : {}),
  };
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ProductSelectionApiError(
      "SELECTION_PROFILE_INVALID",
      `${label}不能为空。`,
    );
  }
  return normalized;
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requiredLines(value: string, label: string): string[] {
  const values = lines(value);
  if (values.length === 0) {
    throw new ProductSelectionApiError(
      "SELECTION_PROFILE_INVALID",
      `${label}至少填写一项。`,
    );
  }
  return values;
}

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function canRenderCreativeProposal(project: ProductVideoProject): boolean {
  const visualAssets = new Set(
    (project.assets.gallery ?? [project.assets.image]).map(
      (asset) => asset.relative_path,
    ),
  );
  return (
    project.creative_production?.production_readiness === "ready" &&
    visualAssets.size >= 4
  );
}

function creativeRouteLabel(route: string): string {
  const labels: Record<string, string> = {
    life_problem: "日常冲突",
    real_test: "真实测试",
    identity: "身份认同",
    tutorial: "轻教程",
    contrast: "反差发现",
  };
  return labels[route] ?? "创意路线";
}

function selectionStatusLabel(
  status: SelectionBatch["status"],
): string {
  const labels: Record<SelectionBatch["status"], string> = {
    analyzed: "已完成 AI 排序",
    analyzing: "Codex 分析中",
    failed: "分析失败",
    imported: "待分析",
    queued: "等待 Codex",
  };
  return labels[status];
}

function toUserMessage(error: unknown): string {
  if (error instanceof ProductSelectionApiError) {
    const issue = error.issues[0];
    return issue
      ? `${issue.path || "输入"}：${issue.message}`
      : `${error.code}：${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "选品或自动成片失败，请确认本机服务仍在运行。";
}
