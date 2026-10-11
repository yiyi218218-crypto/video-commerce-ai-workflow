"use client";

import {
  Check,
  Clipboard,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  PackageCheck,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  type ChannelCommerceMode,
  type ChannelPublishPackage,
  type ChannelVideoDuration,
} from "../schemas/channel-publish.schema.js";
import { scriptAgentOutputSchema } from "../schemas/script-agent.schema.js";
import type { WorkflowRun } from "../schemas/workflow-run.schema.js";
import {
  attachChannelPublishVideo,
  ChannelPublishApiError,
  createChannelPublishPackage,
  openChannelPublishPackageDirectory,
} from "../web/channel-publish-api-client.js";

const channelProfileStorageKey =
  "video-commerce-ai.channel-publish-profile.v1";
const channelsAssistantUrl = "https://channels.weixin.qq.com/";

interface StoredChannelProfile {
  channelDisplayName: string;
  commerceMode: ChannelCommerceMode;
}

export function ChannelPublishAssistant({
  run,
  localMode,
}: {
  run: WorkflowRun | null;
  localMode: boolean;
}) {
  const hasScripts = useMemo(
    () =>
      run
        ? scriptAgentOutputSchema.safeParse(run.artifacts.script_bundle)
            .success
        : false,
    [run],
  );
  const [channelDisplayName, setChannelDisplayName] = useState("");
  const [duration, setDuration] =
    useState<ChannelVideoDuration>(30);
  const [commerceMode, setCommerceMode] =
    useState<ChannelCommerceMode>("wechat_store_product");
  const [productIdOrSku, setProductIdOrSku] = useState("");
  const [commerceNotes, setCommerceNotes] = useState("");
  const [linkageConfirmed, setLinkageConfirmed] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [publishPackage, setPublishPackage] =
    useState<ChannelPublishPackage | null>(null);
  const [busy, setBusy] = useState<
    "create" | "open" | "copy" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(channelProfileStorageKey);
      if (!raw) {
        return;
      }
      const stored = JSON.parse(raw) as Partial<StoredChannelProfile>;
      if (typeof stored.channelDisplayName === "string") {
        setChannelDisplayName(stored.channelDisplayName);
      }
      if (
        stored.commerceMode === "wechat_store_product" ||
        stored.commerceMode === "manual_product_selection" ||
        stored.commerceMode === "none"
      ) {
        setCommerceMode(stored.commerceMode);
        setLinkageConfirmed(stored.commerceMode === "none");
      }
    } catch {
      window.localStorage.removeItem(channelProfileStorageKey);
    }
  }, []);

  useEffect(() => {
    setPublishPackage(null);
    setVideo(null);
    setMessage(null);
    setError(null);
  }, [run?.id]);

  if (!run || !hasScripts) {
    return (
      <section
        className="publish-assistant-card publish-assistant-locked"
        id="channel-publish-assistant"
      >
        <div className="publish-assistant-heading">
          <div>
            <span className="step-label">03 · 本机发布交接</span>
            <h2>视频号本机半自动发布助手</h2>
            <p>
              完成内容方向确认并生成短视频脚本后，这里会自动解锁发布包与带货助手交接。
            </p>
          </div>
          <span className="local-only-badge">
            <ShieldCheck size={13} />
            本机安全模式
          </span>
        </div>
        <div className="publish-locked-state">
          <PackageCheck size={20} />
          <span>
            <strong>等待短视频脚本</strong>
            <small>
              下一步：在上方选择内容方向，点击“确认方向并继续”。
            </small>
          </span>
        </div>
      </section>
    );
  }

  const canCreate =
    localMode &&
    channelDisplayName.trim().length > 0 &&
    busy === null;

  async function handleCreatePackage() {
    if (!run || !canCreate) {
      return;
    }
    setBusy("create");
    setError(null);
    setMessage(
      video ? "正在生成发布包并附加成片…" : "正在生成发布包…",
    );
    try {
      let created = await createChannelPublishPackage({
        run,
        channel: {
          display_name: channelDisplayName.trim(),
        },
        duration_seconds: duration,
        commerce: {
          mode: commerceMode,
          ...(productIdOrSku.trim()
            ? { product_id_or_sku: productIdOrSku.trim() }
            : {}),
          ...(commerceNotes.trim()
            ? { notes: commerceNotes.trim() }
            : {}),
          linkage_confirmed: linkageConfirmed,
        },
      });
      if (video) {
        created = await attachChannelPublishVideo(created.id, video);
      }
      window.localStorage.setItem(
        channelProfileStorageKey,
        JSON.stringify({
          channelDisplayName: channelDisplayName.trim(),
          commerceMode,
        } satisfies StoredChannelProfile),
      );
      setPublishPackage(created);
      setMessage(
        created.readiness.ready_for_manual_publish
          ? "发布包已就绪，可以进入视频号助手完成人工核对与发布。"
          : "发布包已生成；请先完成下方待办，再进入发布页。",
      );
    } catch (caught) {
      setMessage(null);
      setError(toPublishMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenFolder() {
    if (!publishPackage) {
      return;
    }
    setBusy("open");
    setError(null);
    try {
      await openChannelPublishPackageDirectory(publishPackage.id);
      setMessage("已在资源管理器中打开发布包。");
    } catch (caught) {
      setError(toPublishMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function handleCopyCaption() {
    if (!publishPackage) {
      return;
    }
    setBusy("copy");
    setError(null);
    try {
      await navigator.clipboard.writeText(
        publishPackage.publication.caption,
      );
      setMessage("发布文案已复制到剪贴板。");
    } catch {
      setError("浏览器未允许写入剪贴板，请从发布包文本文件复制。");
    } finally {
      setBusy(null);
    }
  }

  function updateCommerceMode(mode: ChannelCommerceMode) {
    setCommerceMode(mode);
    setLinkageConfirmed(mode === "none");
  }

  return (
    <section className="publish-assistant-card" id="channel-publish-assistant">
      <div className="publish-assistant-heading">
        <div>
          <span className="step-label">03 · 本机发布交接</span>
          <h2>视频号本机半自动发布助手</h2>
          <p>
            复用本轮脚本和商品事实，生成发布文案、拍摄脚本、成片与带货关联清单。
          </p>
        </div>
        <span className="local-only-badge">
          <ShieldCheck size={13} />
          本机安全模式
        </span>
      </div>

      {!localMode && (
        <div className="publish-notice">
          发布助手只在 127.0.0.1 本机服务中启用，线上页面不会读取或打开本机文件。
        </div>
      )}

      <div className="publish-field-grid">
        <label className="publish-field">
          <span>目标视频号</span>
          <input
            maxLength={80}
            onChange={(event) =>
              setChannelDisplayName(event.target.value)
            }
            placeholder="填写当前要发布的视频号名称"
            value={channelDisplayName}
          />
        </label>

        <label className="publish-field">
          <span>脚本时长</span>
          <select
            onChange={(event) =>
              setDuration(
                Number(event.target.value) as ChannelVideoDuration,
              )
            }
            value={duration}
          >
            <option value={15}>15 秒</option>
            <option value={30}>30 秒</option>
            <option value={60}>60 秒</option>
          </select>
        </label>

        <label className="publish-field publish-field-wide">
          <span>带货关联方式</span>
          <select
            onChange={(event) =>
              updateCommerceMode(
                event.target.value as ChannelCommerceMode,
              )
            }
            value={commerceMode}
          >
            <option value="wechat_store_product">
              微信小店带货助手选品
            </option>
            <option value="manual_product_selection">
              发布页手动搜索商品
            </option>
            <option value="none">本条视频不带货</option>
          </select>
        </label>

        {commerceMode !== "none" && (
          <>
            <label className="publish-field">
              <span>商品 ID / SKU（可选）</span>
              <input
                maxLength={120}
                onChange={(event) =>
                  setProductIdOrSku(event.target.value)
                }
                placeholder="帮助发布时快速核对"
                value={productIdOrSku}
              />
            </label>
            <label className="publish-field">
              <span>选品备注（可选）</span>
              <input
                maxLength={1_000}
                onChange={(event) =>
                  setCommerceNotes(event.target.value)
                }
                placeholder="规格、店铺或佣金备注"
                value={commerceNotes}
              />
            </label>
          </>
        )}
      </div>

      <label className="publish-upload">
        <Upload size={17} />
        <span>
          <strong>{video ? video.name : "选择剪辑完成的成片"}</strong>
          <small>MP4 / MOV / WebM，最大 1 GB；文件只写入本机发布包</small>
        </span>
        <input
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={(event) =>
            setVideo(event.target.files?.[0] ?? null)
          }
          type="file"
        />
      </label>

      {commerceMode !== "none" && (
        <label className="publish-confirmation">
          <input
            checked={linkageConfirmed}
            onChange={(event) =>
              setLinkageConfirmed(event.target.checked)
            }
            type="checkbox"
          />
          <span>
            我会在官方发布页打开带货助手，并人工核对商品名称、规格、价格、库存和优惠。
          </span>
        </label>
      )}

      <div className="publish-boundary">
        本助手不会读取微信聊天数据库、Cookie 或私有接口，也不会自动点击最终发布。
      </div>

      <button
        className="primary-button publish-create-button"
        disabled={!canCreate}
        onClick={() => void handleCreatePackage()}
        type="button"
      >
        {busy === "create" ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <PackageCheck size={17} />
        )}
        {busy === "create" ? "正在准备发布包" : "生成本机发布包"}
      </button>

      {error && <div className="publish-error">{error}</div>}
      {message && <div className="publish-message">{message}</div>}

      {publishPackage && (
        <div className="publish-result">
          <div className="publish-result-status">
            <span
              className={
                publishPackage.readiness.ready_for_manual_publish
                  ? "ready"
                  : "pending"
              }
            >
              {publishPackage.readiness.ready_for_manual_publish
                ? "发布材料已就绪"
                : "仍有发布前待办"}
            </span>
            <strong>{publishPackage.publication.title}</strong>
            <code>{publishPackage.directory_path}</code>
          </div>

          {publishPackage.readiness.blocking_items.length > 0 && (
            <ul className="publish-blockers">
              {publishPackage.readiness.blocking_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          <div className="publish-actions">
            <button
              className="secondary-button"
              disabled={busy !== null}
              onClick={() => void handleCopyCaption()}
              type="button"
            >
              <Clipboard size={15} />
              复制文案
            </button>
            <button
              className="secondary-button"
              disabled={busy !== null}
              onClick={() => void handleOpenFolder()}
              type="button"
            >
              <FolderOpen size={15} />
              打开发布包
            </button>
            <a
              className="secondary-button publish-official-link"
              href={channelsAssistantUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
              打开官方视频号助手
            </a>
          </div>
          <p className="publish-final-step">
            <Check size={13} />
            在官方页面上传成片、粘贴文案、通过带货助手关联商品，预览无误后人工发布。
          </p>
        </div>
      )}
    </section>
  );
}

function toPublishMessage(error: unknown): string {
  if (error instanceof ChannelPublishApiError) {
    const issue = error.issues[0];
    return issue
      ? `${issue.path || "输入"}：${issue.message}`
      : `${error.code}：${error.message}`;
  }
  return "发布包生成失败，请确认本机服务仍在运行并重试。";
}
