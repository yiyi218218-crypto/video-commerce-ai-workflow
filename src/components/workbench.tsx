"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  FileText,
  Gauge,
  LayoutDashboard,
  MessageCircleMore,
  Play,
  Radio,
  RefreshCw,
  Settings2,
  ShoppingBag,
  Sparkles,
  Target,
  Video,
  WandSparkles,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import type {
  DataAnalysisInput,
  DerivedMetrics,
} from "../schemas/data-analysis.schema.js";
import {
  analyzePerformance,
  type AnalyzePerformanceResult,
} from "../web/analyze-performance.js";

interface WorkbenchProps {
  initialInput: DataAnalysisInput;
  initialSnapshot: DerivedMetrics;
}

interface FormState {
  productName: string;
  videoId: string;
  title: string;
  durationSeconds: string;
  views: string;
  completionRate: string;
  likes: string;
  comments: string;
  saves: string;
  shares: string;
  productClicks: string;
  addToCarts: string;
  orders: string;
  revenue: string;
  averageViews: string;
  baselineCompletionRate: string;
  baselineLikeRate: string;
  baselineClickRate: string;
  baselineOrderRate: string;
}

type NumberField =
  | "views"
  | "completionRate"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "productClicks"
  | "addToCarts"
  | "orders"
  | "revenue"
  | "averageViews"
  | "baselineCompletionRate"
  | "baselineLikeRate"
  | "baselineClickRate"
  | "baselineOrderRate";

const navigation = [
  { label: "工作流中心", icon: LayoutDashboard, status: "已开放" },
  { label: "商品洞察", icon: ShoppingBag, status: "已接入" },
  { label: "内容策划", icon: WandSparkles, status: "已接入" },
  { label: "视频脚本", icon: Video, status: "已接入" },
  { label: "直播话术", icon: Radio, status: "已接入" },
  { label: "评论运营", icon: MessageCircleMore, status: "已接入" },
  { label: "数据复盘", icon: BarChart3, status: "使用中" },
];

const workflowStages = [
  {
    step: "01",
    label: "商品事实",
    note: "定位与边界",
    icon: ShoppingBag,
    state: "ready",
  },
  {
    step: "02",
    label: "指标计算",
    note: "确定性数据层",
    icon: Gauge,
    state: "active",
  },
  {
    step: "03",
    label: "AI 诊断",
    note: "需连接 Provider",
    icon: Sparkles,
    state: "pending",
  },
  {
    step: "04",
    label: "内容优化",
    note: "回流策划 Agent",
    icon: FileText,
    state: "pending",
  },
  {
    step: "05",
    label: "人工审核",
    note: "确认下一轮",
    icon: ClipboardCheck,
    state: "pending",
  },
] as const;

export function Workbench({
  initialInput,
  initialSnapshot,
}: WorkbenchProps) {
  const initialForm = useMemo(
    () => formFromInput(initialInput),
    [initialInput],
  );
  const [form, setForm] = useState<FormState>(initialForm);
  const [snapshot, setSnapshot] =
    useState<DerivedMetrics>(initialSnapshot);
  const [error, setError] = useState<AnalyzePerformanceResult | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const engagementRate =
    snapshot.rates.like_rate +
    snapshot.rates.comment_rate +
    snapshot.rates.save_rate +
    snapshot.rates.share_rate;

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
  }

  function resetSample() {
    setForm(initialForm);
    setSnapshot(initialSnapshot);
    setError(null);
    setIsDirty(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = analyzePerformance(
        toAnalysisInput(form, initialInput),
      );
      if (!result.ok) {
        setError(result);
        return;
      }
      setSnapshot(result.data.metrics_snapshot);
      setIsDirty(false);
    } catch {
      setError({
        ok: false,
        error: "无法连接指标服务，请稍后重试。",
        issues: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  }

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
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.label === "数据复盘";
            const href =
              item.label === "工作流中心"
                ? "/workflow/"
                : active
                  ? "#analysis"
                  : "#workflow";
            return (
              <a
                className={`nav-item${active ? " active" : ""}`}
                href={href}
                key={item.label}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {active && <i aria-label="当前页面" />}
              </a>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <div className="status-row">
            <span className="status-dot" />
            <span>工作流引擎</span>
            <strong>在线</strong>
          </div>
          <p>指标服务使用本地确定性计算，不消耗模型额度。</p>
        </div>

        <button
          className="sidebar-settings"
          disabled
          title="Provider 由服务端环境变量配置"
          type="button"
        >
          <Settings2 aria-hidden="true" size={17} />
          Provider 设置
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              工作空间 <ChevronRight aria-hidden="true" size={13} /> 数据复盘
            </p>
            <h1>数据复盘工作台</h1>
          </div>
          <div className="topbar-actions">
            <div className="provider-pill">
              <CircleAlert aria-hidden="true" size={15} />
              AI Provider 未连接
            </div>
            <button
              className="secondary-button"
              disabled
              title="当前可通过 CLI 查看持久化运行记录"
              type="button"
            >
              <FileText aria-hidden="true" size={16} />
              查看运行记录
            </button>
          </div>
        </header>

        <section className="hero-panel" id="overview">
          <div className="hero-copy">
            <span className="section-kicker">PERFORMANCE LOOP · PHASE 4</span>
            <h2>
              把每条视频的结果，
              <br />
              变成下一条的起点。
            </h2>
            <p>
              先校验数据和漏斗，再交给 AI 做审慎诊断。指标不由模型计算，
              优化建议保留人工确认。
            </p>
          </div>
          <div className="hero-proof">
            <div>
              <strong>5</strong>
              <span>漏斗环节</span>
            </div>
            <div>
              <strong>2–5</strong>
              <span>单变量实验</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>指标可追溯</span>
            </div>
          </div>
        </section>

        <section className="workflow-panel" id="workflow">
          <div className="section-heading">
            <div>
              <span className="eyebrow">闭环进度</span>
              <h2>本轮优化工作流</h2>
            </div>
            <span className="workflow-id">RUN · 尚未创建</span>
          </div>
          <div className="workflow-rail">
            {workflowStages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <div className="workflow-stage-wrap" key={stage.step}>
                  <article className={`workflow-stage ${stage.state}`}>
                    <div className="workflow-icon">
                      {stage.state === "ready" ? (
                        <Check aria-hidden="true" size={17} />
                      ) : (
                        <Icon aria-hidden="true" size={18} />
                      )}
                    </div>
                    <div>
                      <span>{stage.step}</span>
                      <strong>{stage.label}</strong>
                      <small>{stage.note}</small>
                    </div>
                  </article>
                  {index < workflowStages.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className="workflow-arrow"
                      size={17}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="analysis-grid" id="analysis">
          <form className="input-card" onSubmit={handleSubmit}>
            <div className="card-heading">
              <div>
                <span className="step-label">01 · 数据输入</span>
                <h2>这条视频表现如何？</h2>
                <p>录入视频号后台的同一统计周期数据。</p>
              </div>
              <button
                className="text-button"
                onClick={resetSample}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={14} />
                恢复示例
              </button>
            </div>

            <fieldset>
              <legend>内容信息</legend>
              <div className="field-grid">
                <Field
                  label="商品名称"
                  name="productName"
                  onChange={updateField}
                  value={form.productName}
                />
                <Field
                  label="视频 ID"
                  name="videoId"
                  onChange={updateField}
                  value={form.videoId}
                />
                <Field
                  className="field-wide"
                  label="视频标题"
                  name="title"
                  onChange={updateField}
                  value={form.title}
                />
                <Field
                  label="视频时长"
                  name="durationSeconds"
                  onChange={updateField}
                  suffix="秒"
                  type="number"
                  value={form.durationSeconds}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend>核心数据</legend>
              <div className="metric-input-grid">
                <MetricField
                  label="播放量"
                  name="views"
                  onChange={updateField}
                  value={form.views}
                />
                <MetricField
                  label="完播率"
                  name="completionRate"
                  onChange={updateField}
                  suffix="%"
                  value={form.completionRate}
                />
                <MetricField
                  label="点赞"
                  name="likes"
                  onChange={updateField}
                  value={form.likes}
                />
                <MetricField
                  label="评论"
                  name="comments"
                  onChange={updateField}
                  value={form.comments}
                />
                <MetricField
                  label="收藏"
                  name="saves"
                  onChange={updateField}
                  value={form.saves}
                />
                <MetricField
                  label="分享"
                  name="shares"
                  onChange={updateField}
                  value={form.shares}
                />
                <MetricField
                  label="商品点击"
                  name="productClicks"
                  onChange={updateField}
                  value={form.productClicks}
                />
                <MetricField
                  label="加购"
                  name="addToCarts"
                  onChange={updateField}
                  value={form.addToCarts}
                />
                <MetricField
                  label="成交单数"
                  name="orders"
                  onChange={updateField}
                  value={form.orders}
                />
                <MetricField
                  label="成交金额"
                  name="revenue"
                  onChange={updateField}
                  prefix="¥"
                  value={form.revenue}
                />
              </div>
            </fieldset>

            <details className="baseline-details">
              <summary>
                <span>
                  <Target aria-hidden="true" size={16} />
                  账号基线
                </span>
                <small>用于判断相对表现</small>
              </summary>
              <div className="metric-input-grid baseline-grid">
                <MetricField
                  label="平均播放"
                  name="averageViews"
                  onChange={updateField}
                  value={form.averageViews}
                />
                <MetricField
                  label="基线完播"
                  name="baselineCompletionRate"
                  onChange={updateField}
                  suffix="%"
                  value={form.baselineCompletionRate}
                />
                <MetricField
                  label="基线点赞"
                  name="baselineLikeRate"
                  onChange={updateField}
                  suffix="%"
                  value={form.baselineLikeRate}
                />
                <MetricField
                  label="基线点击"
                  name="baselineClickRate"
                  onChange={updateField}
                  suffix="%"
                  value={form.baselineClickRate}
                />
                <MetricField
                  label="基线成交"
                  name="baselineOrderRate"
                  onChange={updateField}
                  suffix="%"
                  value={form.baselineOrderRate}
                />
              </div>
            </details>

            {error && !error.ok && (
              <div className="error-banner" role="alert">
                <CircleAlert aria-hidden="true" size={17} />
                <div>
                  <strong>{error.error}</strong>
                  {error.issues.slice(0, 3).map((issue) => (
                    <span key={`${issue.path}-${issue.message}`}>
                      {issue.path || "输入"}：{issue.message}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              className="primary-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <RefreshCw
                  aria-hidden="true"
                  className="spin"
                  size={17}
                />
              ) : (
                <Activity aria-hidden="true" size={17} />
              )}
              {isSubmitting ? "正在校验并计算" : "计算本轮指标"}
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </form>

          <section className="result-column" aria-live="polite">
            <article className="result-card">
              <div className="card-heading result-heading">
                <div>
                  <span className="step-label">02 · 指标快照</span>
                  <h2>确定性结果</h2>
                  <p>所有比率均由原始数据计算，AI 无权改写。</p>
                </div>
                <span
                  className={`quality-badge ${
                    snapshot.data_quality.usable ? "good" : "warning"
                  }`}
                >
                  {snapshot.data_quality.usable ? (
                    <Check aria-hidden="true" size={13} />
                  ) : (
                    <CircleAlert aria-hidden="true" size={13} />
                  )}
                  {snapshot.data_quality.usable ? "数据可用" : "需要校正"}
                </span>
              </div>

              {isDirty && (
                <div className="dirty-notice">
                  参数已修改，点击“计算本轮指标”更新结果。
                </div>
              )}

              <div className="metric-cards">
                <MetricCard
                  delta={snapshot.baseline_comparison.completion_rate_delta}
                  format="percentage"
                  label="完播率"
                  value={snapshot.rates.completion_rate}
                />
                <MetricCard
                  label="综合互动率"
                  value={engagementRate}
                  format="percentage"
                />
                <MetricCard
                  delta={snapshot.baseline_comparison.click_rate_delta}
                  format="percentage"
                  label="商品点击率"
                  value={snapshot.rates.click_rate}
                />
                <MetricCard
                  delta={snapshot.baseline_comparison.order_rate_delta}
                  format="percentage"
                  label="播放成交率"
                  value={snapshot.rates.order_rate_per_view}
                />
              </div>

              <div className="funnel-block">
                <div className="subsection-heading">
                  <div>
                    <span>转化漏斗</span>
                    <small>按播放量归一</small>
                  </div>
                  <span className={`sample-tag ${snapshot.sample_quality}`}>
                    {sampleQualityLabel(snapshot.sample_quality)}
                  </span>
                </div>
                <Funnel
                  completions={snapshot.estimated_completions}
                  clicks={numeric(form.productClicks)}
                  orders={numeric(form.orders)}
                  views={snapshot.views}
                />
              </div>

              <div className="revenue-strip">
                <div>
                  <span>每千次播放产出</span>
                  <strong>
                    {formatCurrency(
                      snapshot.revenue.per_thousand_views,
                    )}
                  </strong>
                </div>
                <div>
                  <span>平均客单价</span>
                  <strong>
                    {formatCurrency(snapshot.revenue.average_order_value)}
                  </strong>
                </div>
                <div>
                  <span>播放基线指数</span>
                  <strong>
                    {snapshot.baseline_comparison.view_index === null
                      ? "—"
                      : `${snapshot.baseline_comparison.view_index.toFixed(2)}×`}
                  </strong>
                </div>
              </div>

              {snapshot.data_quality.warnings.length > 0 && (
                <div className="warning-list">
                  <strong>数据质量提示</strong>
                  {snapshot.data_quality.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}
            </article>

            <article className="ai-gate-card">
              <div className="ai-gate-icon">
                <Sparkles aria-hidden="true" size={22} />
              </div>
              <div className="ai-gate-copy">
                <span>下一步 · AI 漏斗诊断</span>
                <h3>指标准备就绪，等待 Provider</h3>
                <p>
                  连接业务 LLM 后，将生成 Hook、留存、互动、信任与转化诊断，
                  并把优化 brief 自动回流给内容策划 Agent。
                </p>
              </div>
              <button
                className="connect-button"
                disabled
                title="真实 Provider 适配将在后续接入"
                type="button"
              >
                <Settings2 aria-hidden="true" size={15} />
                配置 Provider
              </button>
            </article>

            <div className="guardrails">
              <div>
                <Check aria-hidden="true" size={15} />
                低样本禁止高置信度
              </div>
              <div>
                <Check aria-hidden="true" size={15} />
                异常数据停止 AI 解读
              </div>
              <div>
                <Check aria-hidden="true" size={15} />
                优化方案必须人工审核
              </div>
            </div>
          </section>
        </section>

        <footer>
          <span>Video Commerce AI · v0.11.0 Selection & Auto Video</span>
          <span>本系统不自动发布内容或操作微信账号</span>
        </footer>
      </main>
    </div>
  );
}

interface FieldProps {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  type?: "text" | "number";
  suffix?: string;
  className?: string;
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  suffix,
  className,
}: FieldProps) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      <div className="input-shell">
        <input
          min={type === "number" ? 0 : undefined}
          name={name}
          onChange={(event) => onChange(name, event.target.value)}
          required
          type={type}
          value={value}
        />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  );
}

interface MetricFieldProps {
  label: string;
  name: NumberField;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  prefix?: string;
  suffix?: string;
}

function MetricField({
  label,
  name,
  value,
  onChange,
  prefix,
  suffix,
}: MetricFieldProps) {
  return (
    <label className="metric-field">
      <span>{label}</span>
      <div className="input-shell">
        {prefix && <b>{prefix}</b>}
        <input
          min="0"
          name={name}
          onChange={(event) => onChange(name, event.target.value)}
          required
          step="any"
          type="number"
          value={value}
        />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  );
}

function MetricCard({
  label,
  value,
  delta,
  format,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  format: "percentage";
}) {
  const formatted =
    value === null
      ? "—"
      : format === "percentage"
        ? `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`
        : String(value);
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{formatted}</strong>
      {delta !== undefined && delta !== null ? (
        <small className={delta >= 0 ? "positive" : "negative"}>
          {delta >= 0 ? "↑" : "↓"} 较基线{" "}
          {Math.abs(delta * 100).toFixed(1)}pp
        </small>
      ) : (
        <small>本轮计算值</small>
      )}
    </div>
  );
}

function Funnel({
  views,
  completions,
  clicks,
  orders,
}: {
  views: number;
  completions: number;
  clicks: number;
  orders: number;
}) {
  const rows = [
    { label: "播放", value: views, tone: "navy" },
    { label: "估算完播", value: completions, tone: "teal" },
    { label: "商品点击", value: clicks, tone: "orange" },
    { label: "成交", value: orders, tone: "coral" },
  ];
  return (
    <div className="funnel">
      {rows.map((row) => {
        const percentage =
          views > 0 ? Math.min((row.value / views) * 100, 100) : 0;
        return (
          <div className="funnel-row" key={row.label}>
            <span>{row.label}</span>
            <div className="funnel-track">
              <i
                className={row.tone}
                style={{ width: `${Math.max(percentage, 1.5)}%` }}
              />
            </div>
            <strong>{formatInteger(row.value)}</strong>
            <small>{percentage.toFixed(1)}%</small>
          </div>
        );
      })}
    </div>
  );
}

function formFromInput(input: DataAnalysisInput): FormState {
  return {
    productName: "低糖燕麦坚果脆",
    videoId: input.video_id,
    title: input.title,
    durationSeconds: String(input.duration_seconds),
    views: String(input.metrics.views),
    completionRate: String(input.metrics.completion_rate * 100),
    likes: String(input.metrics.likes),
    comments: String(input.metrics.comments),
    saves: String(input.metrics.saves),
    shares: String(input.metrics.shares),
    productClicks: String(input.metrics.product_clicks ?? ""),
    addToCarts: String(input.metrics.add_to_carts ?? ""),
    orders: String(input.metrics.orders),
    revenue: String(input.metrics.revenue ?? ""),
    averageViews: String(input.baseline?.average_views ?? ""),
    baselineCompletionRate: String(
      (input.baseline?.completion_rate ?? 0) * 100,
    ),
    baselineLikeRate: String(
      (input.baseline?.like_rate ?? 0) * 100,
    ),
    baselineClickRate: String(
      (input.baseline?.click_rate ?? 0) * 100,
    ),
    baselineOrderRate: String(
      (input.baseline?.order_rate ?? 0) * 100,
    ),
  };
}

function toAnalysisInput(
  form: FormState,
  source: DataAnalysisInput,
): DataAnalysisInput {
  return {
    video_id: form.videoId.trim(),
    title: form.title.trim(),
    duration_seconds: numeric(form.durationSeconds),
    content_context: source.content_context,
    metrics: {
      views: integer(form.views),
      completion_rate: numeric(form.completionRate) / 100,
      likes: integer(form.likes),
      comments: integer(form.comments),
      saves: integer(form.saves),
      shares: integer(form.shares),
      product_clicks: integer(form.productClicks),
      add_to_carts: integer(form.addToCarts),
      orders: integer(form.orders),
      revenue: numeric(form.revenue),
    },
    baseline: {
      average_views: numeric(form.averageViews),
      completion_rate: numeric(form.baselineCompletionRate) / 100,
      like_rate: numeric(form.baselineLikeRate) / 100,
      click_rate: numeric(form.baselineClickRate) / 100,
      order_rate: numeric(form.baselineOrderRate) / 100,
    },
    operator_notes: source.operator_notes,
  };
}

function numeric(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function integer(value: string): number {
  return Math.round(numeric(value));
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

function sampleQualityLabel(
  quality: DerivedMetrics["sample_quality"],
): string {
  const labels = {
    insufficient: "样本不足",
    low: "低样本",
    medium: "中等样本",
    high: "高样本",
  };
  return labels[quality];
}
