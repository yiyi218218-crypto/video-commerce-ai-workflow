"use client";

import {
  Archive,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Video,
  WandSparkles,
} from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ChannelPublishAssistant } from "./channel-publish-assistant";
import { AccountIncubationWorkbench } from "./account-incubation-workbench";
import { ProductSelectionWorkbench } from "./product-selection-workbench";
import { middleAgedLifestyleOperationProfile } from "../presets/middle-aged-lifestyle-operation.js";
import {
  contentAgentOutputSchema,
  type ContentAgentOutput,
} from "../schemas/content-agent.schema.js";
import {
  liveAgentOutputSchema,
  type LiveAgentOutput,
} from "../schemas/live-agent.schema.js";
import {
  productAgentOutputSchema,
  type ProductAgentOutput,
} from "../schemas/product-agent.schema.js";
import {
  scriptAgentOutputSchema,
  type ScriptAgentOutput,
} from "../schemas/script-agent.schema.js";
import type { WorkflowRun } from "../schemas/workflow-run.schema.js";
import type { CodexJob } from "../web/codex-job.schema.js";
import { getRecoverableRuns } from "../web/codex-job-recovery.js";
import { BrowserRunStore } from "../web/browser-run-store.js";
import {
  executeVideoSalesWorkflow,
  getProviderStatus,
  listCodexJobs,
  waitForCodexJob,
  WorkflowApiError,
} from "../web/workflow-api-client.js";
import type {
  ProviderStatus,
  WebWorkflowInput,
} from "../web/workflow-api.schema.js";

interface FormState {
  productName: string;
  category: WebWorkflowInput["product"]["category"];
  price: string;
  targetUsers: string;
  description: string;
  productFacts: string;
  onCameraPeople: string;
  locations: string;
  shootingStyle:
    WebWorkflowInput["production_context"]["shooting_style"];
  prohibitedClaims: string;
  liveDuration: string;
  hostStyle: string;
  teamSize: string;
  inventory: string;
  offers: string;
}

const initialForm: FormState = {
  productName: "低糖燕麦坚果脆",
  category: "food",
  price: "39.9",
  targetUsers: "关注控糖的上班族\n需要便携早餐的人群",
  description:
    "燕麦与坚果烘焙的即食零食，独立小包装，适合作为早餐搭配或办公室加餐。",
  productFacts:
    "每袋独立包装\n配料表可在直播间展示\n单盒 10 袋\n常温保存",
  onCameraPeople: "店主",
  locations: "家庭餐桌\n办公室桌面",
  shootingStyle: "phone_natural",
  prohibitedClaims: "疾病治疗功效\n未经确认的减肥承诺\n虚构销量与库存",
  liveDuration: "60",
  hostStyle: "真实、亲切、克制",
  teamSize: "1",
  inventory: "",
  offers: "",
};

const categories: Array<{
  value: FormState["category"];
  label: string;
}> = [
  { value: "food", label: "食品" },
  { value: "clothing", label: "服装" },
  { value: "jewelry", label: "珠宝" },
  { value: "beauty", label: "美妆" },
  { value: "home", label: "家居" },
  { value: "maternal_baby", label: "母婴" },
];

const shootingStyles: Array<{
  value: FormState["shootingStyle"];
  label: string;
}> = [
  { value: "phone_natural", label: "手机自然拍摄" },
  { value: "dialogue", label: "双人对话" },
  { value: "voice_over", label: "画外音" },
  { value: "product_demo", label: "产品演示" },
  { value: "mixed", label: "混合形式" },
];

const stageMeta = [
  { id: "product_analysis", label: "商品洞察", icon: ShoppingBag },
  { id: "content_plan", label: "内容方向", icon: WandSparkles },
  { id: "script_bundle", label: "三版脚本", icon: Video },
  { id: "live_playbook", label: "直播话术", icon: Radio },
] as const;

export function WorkflowConsole() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [providerError, setProviderError] = useState(false);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string>("");
  const [busy, setBusy] = useState<"start" | "resume" | null>(null);
  const [jobProgress, setJobProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const store = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : new BrowserRunStore(window.localStorage),
    [],
  );
  const activeRun =
    runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null;
  const contentPlan = useMemo(
    () => parseContentPlan(activeRun),
    [activeRun],
  );

  useEffect(() => {
    if (store) {
      const storedRuns = store.list();
      setRuns(storedRuns);
      setActiveRunId(storedRuns[0]?.id ?? null);
    }
    void refreshProvider();
  }, [store]);

  useEffect(() => {
    if (!contentPlan) {
      setSelectedDirection("");
      return;
    }
    const firstRecommended =
      contentPlan.selection_guide.recommended_direction_ids[0] ??
      contentPlan.directions[0]?.direction_id ??
      "";
    setSelectedDirection(firstRecommended);
  }, [activeRun?.id, contentPlan]);

  useEffect(() => {
    if (provider?.persistence !== "local_file" || busy !== null) {
      return;
    }
    let active = true;
    let recoveryOwnsBusyState = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const jobs = await listCodexJobs();
        const storedRuns = store?.list() ?? [];
        const recoverableRuns = getRecoverableRuns(jobs, storedRuns);
        if (recoverableRuns.length > 0 && active) {
          let recoveredRuns = storedRuns;
          for (const run of recoverableRuns) {
            recoveredRuns = store?.save(run) ?? [
              run,
              ...recoveredRuns.filter((item) => item.id !== run.id),
            ];
          }
          setRuns(recoveredRuns);
          setActiveRunId(recoverableRuns.at(-1)?.id ?? null);
        }

        const pending = jobs.find(
          (job) => job.status === "queued" || job.status === "running",
        );
        if (!pending || !active) {
          return;
        }
        recoveryOwnsBusyState = true;
        setBusy(pending.action);
        handleJobProgress(pending);
        const run = await waitForCodexJob(pending.id, {
          onProgress: (job) => {
            if (active) {
              handleJobProgress(job);
            }
          },
          signal: controller.signal,
        });
        if (active) {
          saveRun(run);
        }
      } catch (caught) {
        if (active && !controller.signal.aborted) {
          setError(toUserMessage(caught));
        }
      } finally {
        if (active && recoveryOwnsBusyState) {
          setBusy(null);
          setJobProgress(null);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [provider?.persistence]);

  async function refreshProvider() {
    setProviderError(false);
    try {
      setProvider(await getProviderStatus());
    } catch {
      setProvider(null);
      setProviderError(true);
    }
  }

  function updateField<Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function startWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("start");
    setJobProgress("正在提交 Codex 任务");
    setError(null);
    try {
      const run = await executeVideoSalesWorkflow(
        {
          action: "start",
          input: toWorkflowInput(form),
        },
        { onProgress: handleJobProgress },
      );
      saveRun(run);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
      setJobProgress(null);
    }
  }

  async function resumeWorkflow() {
    if (!activeRun || !selectedDirection) {
      return;
    }
    setBusy("resume");
    setJobProgress("正在提交 Codex 续跑任务");
    setError(null);
    try {
      const run = await executeVideoSalesWorkflow(
        {
          action: "resume",
          run: activeRun,
          checkpoint: {
            selected_direction_id:
              selectedDirection as "direction_1",
          },
        },
        { onProgress: handleJobProgress },
      );
      saveRun(run);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(null);
      setJobProgress(null);
    }
  }

  function handleJobProgress(job: CodexJob) {
    setJobProgress(describeJobProgress(job));
    if (job.run) {
      saveRun(job.run);
    }
  }

  function saveRun(run: WorkflowRun) {
    const nextRuns = store?.save(run) ?? [
      run,
      ...runs.filter((item) => item.id !== run.id),
    ];
    setRuns(nextRuns);
    setActiveRunId(run.id);
  }

  function removeRun(runId: string) {
    const nextRuns =
      store?.remove(runId) ?? runs.filter((run) => run.id !== runId);
    setRuns(nextRuns);
    setActiveRunId(nextRuns[0]?.id ?? null);
  }

  function exportRun(run: WorkflowRun) {
    const blob = new Blob([`${JSON.stringify(run, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${run.workflow}-${run.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const providerReady = provider?.configured === true;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Play aria-hidden="true" fill="currentColor" size={17} />
          </div>
          <div>
            <strong>Video Commerce</strong>
            <span>AI OPERATIONS</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="主导航">
          <p className="nav-eyebrow">工作空间</p>
          <a className="nav-item active" href="/workflow/">
            <LayoutDashboard aria-hidden="true" size={18} />
            <span>工作流中心</span>
            <i aria-label="当前页面" />
          </a>
          <a className="nav-item" href="#account-incubation">
            <Video aria-hidden="true" size={18} />
            <span>账号冷启动</span>
          </a>
          <a className="nav-item" href="#product-selection">
            <ShoppingBag aria-hidden="true" size={18} />
            <span>AI 选品中心</span>
          </a>
          <a className="nav-item" href="#run-output">
            <WandSparkles aria-hidden="true" size={18} />
            <span>内容生产</span>
          </a>
          <a className="nav-item" href="#channel-publish-assistant">
            <Video aria-hidden="true" size={18} />
            <span>发布助手</span>
          </a>
          <a className="nav-item" href="#run-history">
            <Archive aria-hidden="true" size={18} />
            <span>运行记录</span>
          </a>
          <a className="nav-item" href="/">
            <FileText aria-hidden="true" size={18} />
            <span>数据复盘</span>
          </a>
        </nav>

        <div className="sidebar-status">
          <div className="status-row">
            <span
              className={`status-dot${providerReady ? "" : " status-muted"}`}
            />
            <span>工作流引擎</span>
            <strong>{providerReady ? "可执行" : "待配置"}</strong>
          </div>
          <p>
            {provider?.provider === "codex_local"
              ? "AI 由本机 Codex 登录执行，运行记录保存在当前浏览器。"
              : "密钥只从 Worker 环境变量读取，运行记录仅保存在当前浏览器。"}
          </p>
        </div>

        <a className="sidebar-settings console-settings" href="#provider">
          <Settings2 aria-hidden="true" size={17} />
          Provider 状态
          <ChevronRight aria-hidden="true" size={16} />
        </a>
      </aside>

      <main className="main-content console-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              工作空间 <ChevronRight aria-hidden="true" size={13} /> 工作流中心
            </p>
            <h1>AI 视频号内容工作流</h1>
          </div>
          <ProviderPill
            error={providerError}
            onRefresh={refreshProvider}
            provider={provider}
          />
        </header>

        <section className="console-hero">
          <div>
            <span className="section-kicker">
              CONTENT FIRST · ACCOUNT INCUBATION
            </span>
            <h2>先把账号做起来，再考虑带货。</h2>
            <p>
              冷启动阶段只做真实家庭生活内容：先建立受众标签、完成第一周排期和首批可审片视频，不挂商品、不做销售承诺。
            </p>
          </div>
          <div className="console-hero-stats">
            <div>
              <strong>21</strong>
              <span>首周选题</span>
            </div>
            <div>
              <strong>3</strong>
              <span>首日视频分镜</span>
            </div>
            <div>
              <strong>0</strong>
              <span>商品露出</span>
            </div>
          </div>
        </section>

        <section className="provider-boundary" id="account-operation-sample">
          <Sparkles size={19} />
          <div>
            <strong>已启用：50+家庭生活冷启动样本</strong>
            <p>
              先让主号沉淀真实家庭生活信任；每日 3 条、至少间隔 2 小时，三个发布时间都只是待验证实验窗口。带货模块已后置。
            </p>
          </div>
          <span>原创优先 · 不刷量 · 不搬运</span>
        </section>

        <AccountIncubationWorkbench enabled={providerReady} />

        <details className="console-details commerce-later">
          <summary>带货工作流（账号内容稳定后再启用）</summary>
        <section className="console-stage-rail" aria-label="工作流阶段">
          {stageMeta.map((stage, index) => {
            const record = activeRun?.steps.find(
              (step) => step.id === stage.id,
            );
            const Icon = stage.icon;
            return (
              <div className="console-stage-wrap" key={stage.id}>
                <div
                  className={`console-stage stage-${record?.status ?? "pending"}`}
                >
                  <span>
                    {record?.status === "completed" ? (
                      <Check size={16} />
                    ) : record?.status === "running" ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Icon size={16} />
                    )}
                  </span>
                  <div>
                    <small>0{index + 1}</small>
                    <strong>{stage.label}</strong>
                  </div>
                </div>
                {index < stageMeta.length - 1 && (
                  <ArrowRight className="console-stage-arrow" size={15} />
                )}
              </div>
            );
          })}
        </section>

        <ProductSelectionWorkbench
          localMode={provider?.provider === "codex_local"}
        />

        <section className="console-grid">
          <form
            className="console-form"
            id="product-input"
            onSubmit={startWorkflow}
          >
            <div className="card-heading">
              <div>
                <span className="step-label">01 · 商品输入</span>
                <h2>建立可信商品事实</h2>
                <p>只填写已经确认的信息，空缺会由 Agent 标记而不是编造。</p>
              </div>
              <button
                className="text-button"
                onClick={() => setForm(initialForm)}
                type="button"
              >
                <RefreshCw size={14} />
                恢复示例
              </button>
            </div>

            <div className="console-field-grid">
              <ConsoleField
                label="商品名称"
                onChange={(value) => updateField("productName", value)}
                value={form.productName}
              />
              <label className="console-field">
                <span>商品类目</span>
                <select
                  onChange={(event) =>
                    updateField(
                      "category",
                      event.target.value as FormState["category"],
                    )
                  }
                  value={form.category}
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <ConsoleField
                label="销售价格"
                onChange={(value) => updateField("price", value)}
                prefix="¥"
                type="number"
                value={form.price}
              />
              <ConsoleArea
                label="目标用户（每行一类）"
                onChange={(value) => updateField("targetUsers", value)}
                value={form.targetUsers}
              />
              <ConsoleArea
                className="console-field-wide"
                label="商品描述"
                onChange={(value) => updateField("description", value)}
                value={form.description}
              />
              <ConsoleArea
                className="console-field-wide"
                label="已确认事实（每行一条）"
                onChange={(value) => updateField("productFacts", value)}
                value={form.productFacts}
              />
            </div>

            <details className="console-details" open>
              <summary>拍摄与直播条件</summary>
              <div className="console-field-grid">
                <ConsoleField
                  label="出镜人员"
                  onChange={(value) => updateField("onCameraPeople", value)}
                  value={form.onCameraPeople}
                />
                <ConsoleField
                  label="可用场地"
                  onChange={(value) => updateField("locations", value)}
                  value={form.locations}
                />
                <label className="console-field">
                  <span>拍摄形式</span>
                  <select
                    onChange={(event) =>
                      updateField(
                        "shootingStyle",
                        event.target
                          .value as FormState["shootingStyle"],
                      )
                    }
                    value={form.shootingStyle}
                  >
                    {shootingStyles.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ConsoleField
                  label="主播风格"
                  onChange={(value) => updateField("hostStyle", value)}
                  value={form.hostStyle}
                />
                <ConsoleField
                  label="直播时长"
                  onChange={(value) => updateField("liveDuration", value)}
                  suffix="分钟"
                  type="number"
                  value={form.liveDuration}
                />
                <ConsoleField
                  label="团队人数"
                  onChange={(value) => updateField("teamSize", value)}
                  type="number"
                  value={form.teamSize}
                />
                <ConsoleField
                  label="确认库存（可空）"
                  onChange={(value) => updateField("inventory", value)}
                  type="number"
                  value={form.inventory}
                />
                <ConsoleArea
                  label="确认优惠（可空）"
                  onChange={(value) => updateField("offers", value)}
                  value={form.offers}
                />
                <ConsoleArea
                  className="console-field-wide"
                  label="禁止表述（每行一条）"
                  onChange={(value) =>
                    updateField("prohibitedClaims", value)
                  }
                  value={form.prohibitedClaims}
                />
              </div>
            </details>

            {error && (
              <div className="console-error" role="alert">
                <CircleAlert size={17} />
                <span>{error}</span>
              </div>
            )}

            <button
              className="primary-button console-submit"
              disabled={!providerReady || busy !== null}
              type="submit"
            >
              {busy === "start" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {busy === "start"
                ? jobProgress ?? "正在生成商品洞察与内容方向"
                : providerReady
                  ? "启动 Phase 2 工作流"
                  : "等待服务端 Provider"}
              <ArrowRight size={17} />
            </button>
            <p className="submit-note">
              首次执行到内容方向后暂停，不会自动越过人工审核。
            </p>
          </form>

          <div className="console-results" id="run-output">
            <RunOutput
              busy={busy}
              contentPlan={contentPlan}
              jobProgress={jobProgress}
              onResume={resumeWorkflow}
              onSelectDirection={setSelectedDirection}
              run={activeRun}
              selectedDirection={selectedDirection}
            />
            <ChannelPublishAssistant
              localMode={provider?.provider === "codex_local"}
              run={activeRun}
            />

            <section className="history-card" id="run-history">
              <div className="card-heading">
                <div>
                  <span className="step-label">运行记录</span>
                  <h2>当前浏览器</h2>
                </div>
                <span className="history-count">{runs.length}/20</span>
              </div>

              {runs.length === 0 ? (
                <div className="history-empty">
                  <Clock3 size={20} />
                  <span>完成第一次运行后，记录会出现在这里。</span>
                </div>
              ) : (
                <div className="history-list">
                  {runs.map((run) => (
                    <article
                      className={`history-item${
                        run.id === activeRun?.id ? " selected" : ""
                      }`}
                      key={run.id}
                    >
                      <button
                        className="history-main"
                        onClick={() => setActiveRunId(run.id)}
                        type="button"
                      >
                        <strong>{runProductName(run)}</strong>
                        <span>
                          {statusLabel(run.status)} ·{" "}
                          {formatDate(run.updatedAt)}
                        </span>
                      </button>
                      <button
                        aria-label="导出运行记录"
                        className="icon-button"
                        onClick={() => exportRun(run)}
                        title="导出 JSON"
                        type="button"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        aria-label="删除运行记录"
                        className="icon-button danger"
                        onClick={() => removeRun(run.id)}
                        title="删除本地记录"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
        </details>

        <section className="provider-boundary" id="provider">
          <Settings2 size={19} />
          <div>
            <strong>Provider 安全边界</strong>
            <p>
              {provider?.provider === "codex_local"
                ? "本机 Bridge 仅监听 127.0.0.1，复用已保存的 Codex 登录；作业串行执行并将进度快照保存在本机。"
                : "Web 端不接收、不显示也不持久化 API Key。管理员通过 VCA_LLM_API_KEY、VCA_LLM_MODEL 和可选 VCA_LLM_BASE_URL 配置 Worker。"}
            </p>
          </div>
          <span>{providerReady ? provider.model : "未配置"}</span>
        </section>

        <footer>
          <span>Video Commerce AI · v0.11.0 Selection & Auto Video</span>
          <span>AI 选品与自动成片，最终带货关联人工确认</span>
        </footer>
      </main>
    </div>
  );
}

function ProviderPill({
  provider,
  error,
  onRefresh,
}: {
  provider: ProviderStatus | null;
  error: boolean;
  onRefresh: () => Promise<void>;
}) {
  const ready = provider?.configured === true;
  return (
    <button
      className={`provider-pill provider-status-button${
        ready ? " provider-ready" : ""
      }`}
      onClick={() => void onRefresh()}
      type="button"
    >
      {error ? (
        <CircleAlert size={15} />
      ) : provider === null ? (
        <LoaderCircle className="spin" size={15} />
      ) : ready ? (
        <Check size={15} />
      ) : (
        <CircleAlert size={15} />
      )}
      {error
        ? "工作流 API 不可用"
        : provider === null
          ? "检查 Provider"
          : ready
            ? `Provider · ${provider.model}`
            : "Provider 未配置"}
    </button>
  );
}

function RunOutput({
  run,
  contentPlan,
  selectedDirection,
  onSelectDirection,
  onResume,
  busy,
  jobProgress,
}: {
  run: WorkflowRun | null;
  contentPlan: ContentAgentOutput | null;
  selectedDirection: string;
  onSelectDirection: (value: string) => void;
  onResume: () => Promise<void>;
  busy: "start" | "resume" | null;
  jobProgress: string | null;
}) {
  if (!run) {
    return (
      <section className="run-card run-card-empty">
        <div className="empty-orbit">
          <Sparkles size={25} />
        </div>
        <span className="step-label">02 · 工作流输出</span>
        <h2>等待第一轮执行</h2>
        <p>
          结果不会使用页面示例伪装。Provider 配置完成并真实执行后，
          商品洞察和五个内容方向会显示在这里。
        </p>
      </section>
    );
  }

  const productInsight = parseProductInsight(run);
  const scriptBundle = parseScriptBundle(run);
  const livePlaybook = parseLivePlaybook(run);
  const operationPlaybook = contentPlan?.operation_playbook ?? null;
  const selectedDirectionDetail =
    contentPlan?.directions.find(
      (direction) => direction.direction_id === selectedDirection,
    ) ?? null;

  return (
    <section className="run-card">
      <div className="run-card-header">
        <div>
          <span className="step-label">02 · 工作流输出</span>
          <h2>{runProductName(run)}</h2>
        </div>
        <span className={`run-status status-${run.status}`}>
          {statusLabel(run.status)}
        </span>
      </div>

      {run.error && (
        <div className="console-error">
          <CircleAlert size={17} />
          <span>
            {run.error.code}：{run.error.message}
          </span>
        </div>
      )}

      {productInsight && (
        <div className="insight-block">
          <span>市场定位</span>
          <h3>{productInsight.market_positioning.statement}</h3>
          <p>{productInsight.market_positioning.recommended_sales_angle}</p>
          <div className="selling-point-list">
            {productInsight.selling_points.slice(0, 4).map((point) => (
              <span key={point.statement}>{point.statement}</span>
            ))}
          </div>
        </div>
      )}

      {operationPlaybook && (
        <div className="insight-block">
          <span>中老年矩阵运营样本</span>
          <h3>{operationPlaybook.account_setup.positioning_statement}</h3>
          <p>{operationPlaybook.launch_plan.cadence}</p>
          <div className="selling-point-list">
            {operationPlaybook.launch_plan.publish_windows.map((window) => (
              <span key={window.id}>
                {window.time_range} · {window.status === "test_window" ? "待验证窗口" : "已验证窗口"}
              </span>
            ))}
          </div>
          <p>{operationPlaybook.matrix_plan.anti_duplication_rule}</p>
        </div>
      )}

      {run.status === "waiting_for_input" && contentPlan && (
        <div className="direction-block">
          <div className="direction-heading">
            <div>
              <span>人工检查点</span>
              <h3>选择下一步拍摄方向</h3>
            </div>
            <strong>必须确认</strong>
          </div>
          <div className="direction-explainer" role="note">
            <strong>这一步做什么？</strong>
            <p>
              先从内容切口中选一个。选中不会生成视频、不会发布；只有确认后才会调用 Codex 生成脚本和直播话术。
            </p>
          </div>
          <div className="direction-action-bar" aria-live="polite" role="status">
            <div>
              <span>
                {busy === "resume" ? "正在生成" : "已选方向，尚未确认"}
              </span>
              <strong>
                {selectedDirectionDetail?.theme ?? "请选择一个拍摄方向"}
              </strong>
              <p>
                {busy === "resume"
                  ? jobProgress ?? "Codex 正在生成脚本与直播话术…"
                  : "确认后生成 15 / 30 / 60 秒脚本和完整直播话术；不会发布视频或关联商品。"}
              </p>
            </div>
            <button
              className="primary-button direction-submit"
              disabled={!selectedDirection || busy !== null}
              onClick={() => void onResume()}
              type="button"
            >
              {busy === "resume" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              {busy === "resume"
                ? jobProgress ?? "正在生成"
                : "确认并生成脚本"}
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="direction-list">
            {contentPlan.directions.map((direction) => (
              <label
                className={`direction-option${
                  selectedDirection === direction.direction_id
                    ? " selected"
                    : ""
                }`}
                key={direction.direction_id}
              >
                <input
                  checked={selectedDirection === direction.direction_id}
                  name="direction"
                  onChange={() =>
                    onSelectDirection(direction.direction_id)
                  }
                  type="radio"
                  value={direction.direction_id}
                />
                <div>
                  <span>{direction.narrative_mode}</span>
                  <strong>{direction.theme}</strong>
                  <p>{direction.hooks[0]}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {scriptBundle && (
        <div className="deliverable-block">
          <div className="deliverable-heading">
            <span>短视频脚本</span>
            <strong>15s · 30s · 60s</strong>
          </div>
          {Object.values(scriptBundle.scripts).map((script) => (
            <article key={script.duration_seconds}>
              <span>{script.duration_seconds} 秒</span>
              <strong>{script.hook}</strong>
              <p>{script.closing_cta}</p>
            </article>
          ))}
        </div>
      )}

      {livePlaybook && (
        <div className="deliverable-block live-deliverable">
          <div className="deliverable-heading">
            <span>直播话术</span>
            <strong>{livePlaybook.run_of_show.length} 个流程段</strong>
          </div>
          <article>
            <span>开场第 1 分钟</span>
            <strong>
              {livePlaybook.opening_five_minutes[0]?.host_script}
            </strong>
            <p>{livePlaybook.order_guidance[0]?.script}</p>
          </article>
        </div>
      )}

      <div className="run-meta">
        <span>Run ID</span>
        <code>{run.id}</code>
        <span>更新于 {formatDate(run.updatedAt)}</span>
      </div>
    </section>
  );
}

function ConsoleField({
  label,
  value,
  onChange,
  type = "text",
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="console-field">
      <span>{label}</span>
      <div className="console-input-shell">
        {prefix && <b>{prefix}</b>}
        <input
          min={type === "number" ? 0 : undefined}
          onChange={(event) => onChange(event.target.value)}
          required={!label.includes("可空")}
          step={type === "number" ? "any" : undefined}
          type={type}
          value={value}
        />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  );
}

function ConsoleArea({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`console-field ${className ?? ""}`}>
      <span>{label}</span>
      <textarea
        onChange={(event) => onChange(event.target.value)}
        required={!label.includes("可空")}
        rows={3}
        value={value}
      />
    </label>
  );
}

function toWorkflowInput(form: FormState): WebWorkflowInput {
  const facts = splitLines(form.productFacts);
  const prohibitedClaims = splitLines(form.prohibitedClaims);
  const inventory = optionalInteger(form.inventory);
  const offerText = form.offers.trim();

  return {
    account_operation_profile: middleAgedLifestyleOperationProfile,
    product: {
      product_name: form.productName.trim(),
      category: form.category,
      price: {
        amount: Number(form.price),
        currency: "CNY",
      },
      target_users: splitLines(form.targetUsers),
      description: form.description.trim(),
      specifications: {},
      product_facts: facts,
      competitors: [],
      sales_constraints: prohibitedClaims,
    },
    production_context: {
      on_camera_people: splitLines(form.onCameraPeople),
      available_locations: splitLines(form.locations),
      shooting_style: form.shootingStyle,
      prohibited_claims: prohibitedClaims,
    },
    live_context: {
      live_duration_minutes: Number(form.liveDuration),
      host_style: form.hostStyle.trim(),
      team_size: Number(form.teamSize),
      ...(inventory === undefined
        ? {}
        : { inventory_quantity: inventory }),
      confirmed_offers: offerText
        ? [
            {
              name: "商家确认优惠",
              details: offerText,
            },
          ]
        : [],
      confirmed_proof_points: facts,
      prohibited_claims: prohibitedClaims,
    },
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|[，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalInteger(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : undefined;
}

function parseContentPlan(run: WorkflowRun | null): ContentAgentOutput | null {
  if (!run) {
    return null;
  }
  const parsed = contentAgentOutputSchema.safeParse(
    run.artifacts.content_plan,
  );
  return parsed.success ? parsed.data : null;
}

function parseProductInsight(
  run: WorkflowRun,
): ProductAgentOutput | null {
  const parsed = productAgentOutputSchema.safeParse(
    run.artifacts.product_analysis,
  );
  return parsed.success ? parsed.data : null;
}

function parseScriptBundle(run: WorkflowRun): ScriptAgentOutput | null {
  const parsed = scriptAgentOutputSchema.safeParse(
    run.artifacts.script_bundle,
  );
  return parsed.success ? parsed.data : null;
}

function parseLivePlaybook(run: WorkflowRun): LiveAgentOutput | null {
  const parsed = liveAgentOutputSchema.safeParse(
    run.artifacts.live_playbook,
  );
  return parsed.success ? parsed.data : null;
}

function runProductName(run: WorkflowRun): string {
  const initial = run.initialInput;
  if (
    typeof initial === "object" &&
    initial !== null &&
    "product" in initial
  ) {
    const product = initial.product;
    if (
      typeof product === "object" &&
      product !== null &&
      "product_name" in product &&
      typeof product.product_name === "string"
    ) {
      return product.product_name;
    }
  }
  return run.workflow;
}

function statusLabel(status: WorkflowRun["status"]): string {
  const labels = {
    pending: "等待执行",
    running: "运行中",
    waiting_for_input: "等待人工确认",
    completed: "已完成",
    failed: "执行失败",
    cancelled: "已取消",
  };
  return labels[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toUserMessage(error: unknown): string {
  if (error instanceof WorkflowApiError) {
    if (error.code === "LLM_PROVIDER_NOT_CONFIGURED") {
      return "服务端尚未配置 AI Provider，请先由管理员写入环境变量。";
    }
    const firstIssue = error.issues[0];
    return firstIssue
      ? `${firstIssue.path || "输入"}：${firstIssue.message}`
      : `${error.code}：${error.message}`;
  }
  return "工作流执行失败，请检查网络与服务端配置后重试。";
}

function describeJobProgress(job: CodexJob): string {
  if (job.status === "queued") {
    return "任务已进入队列，等待 Codex";
  }
  if (job.status === "running") {
    const runningStep = job.run?.steps.find(
      (step) => step.status === "running",
    );
    const labels: Record<string, string> = {
      product_analysis: "Codex 正在分析商品",
      content_plan: "Codex 正在生成内容方向",
      script_bundle: "Codex 正在生成三版脚本",
      live_playbook: "Codex 正在生成直播话术",
    };
    return runningStep
      ? labels[runningStep.id] ?? "Codex 正在执行工作流"
      : "Codex 正在准备工作流";
  }
  if (job.status === "completed") {
    return "Codex 任务已完成";
  }
  if (job.status === "interrupted") {
    return "任务因服务停止而中断";
  }
  return "Codex 任务执行失败";
}
