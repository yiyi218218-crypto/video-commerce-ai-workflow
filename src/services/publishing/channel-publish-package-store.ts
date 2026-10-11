import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { VcaError } from "../../errors.js";
import {
  contentAgentOutputSchema,
  type ContentDirection,
} from "../../schemas/content-agent.schema.js";
import {
  channelPublishPackageSchema,
  createChannelPublishPackageRequestSchema,
  type ChannelPublishPackage,
  type CreateChannelPublishPackageRequest,
} from "../../schemas/channel-publish.schema.js";
import { liveAgentOutputSchema } from "../../schemas/live-agent.schema.js";
import {
  productAgentInputSchema,
  productAgentOutputSchema,
} from "../../schemas/product-agent.schema.js";
import {
  scriptAgentOutputSchema,
  type ScriptVersion,
} from "../../schemas/script-agent.schema.js";

const packageIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumVideoBytes = 1024 * 1024 * 1024;

const videoTypeByExtension = {
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
} as const;

type SupportedVideoType =
  (typeof videoTypeByExtension)[keyof typeof videoTypeByExtension];

export interface AttachChannelVideoInput {
  filename: string;
  mediaType: string;
  source: Readable;
  declaredBytes?: number;
}

export class ChannelPublishPackageStore {
  constructor(private readonly directory: string) {}

  async create(
    request: CreateChannelPublishPackageRequest,
  ): Promise<ChannelPublishPackage> {
    const parsedRequest =
      createChannelPublishPackageRequestSchema.parse(request);
    const source = parseSourceArtifacts(parsedRequest);
    const id = randomUUID();
    const finalDirectory = this.resolvePackageDirectory(id);
    const temporaryDirectory = path.join(
      this.directory,
      `.${id}.${randomUUID()}.tmp`,
    );
    const now = new Date().toISOString();
    const direction = findSelectedDirection(
      source.contentPlan.directions,
      source.scriptBundle.selected_direction_id,
    );
    const script = selectScript(
      source.scriptBundle.scripts,
      parsedRequest.duration_seconds,
    );
    const hashtags = buildHashtags(
      source.product.category,
      source.product.product_name,
      direction.theme,
    );
    const title = direction.titles[0] ?? direction.theme;
    const caption = [
      title,
      "",
      script.hook,
      script.closing_cta,
      "",
      hashtags.join(" "),
    ].join("\n");
    const commerceProductName =
      parsedRequest.commerce.product_name ?? source.product.product_name;
    const commerce = {
      ...parsedRequest.commerce,
      ...(parsedRequest.commerce.mode === "none"
        ? {}
        : { product_name: commerceProductName }),
    };
    const blockingItems = [
      "尚未附加可发布成片。",
      ...(commerce.mode !== "none" && !commerce.linkage_confirmed
        ? ["尚未确认发布时在视频号带货助手中选择并核对商品。"]
        : []),
    ];
    const manualActions = buildManualActions(commerce.mode);
    const files = [
      "01-发布文案.txt",
      "02-短视频脚本.md",
      "03-带货关联清单.md",
      "manifest.json",
      ...(source.livePlaybook ? ["04-直播参考.md"] : []),
    ];
    const record: ChannelPublishPackage = {
      id,
      status: "prepared",
      run_id: parsedRequest.run.id,
      created_at: now,
      updated_at: now,
      directory_path: finalDirectory,
      channel: parsedRequest.channel,
      product: {
        name: source.product.product_name,
        category: source.product.category,
        price_display: formatPrice(
          source.product.price.amount,
          source.product.price.currency,
        ),
      },
      duration_seconds: parsedRequest.duration_seconds,
      publication: {
        title,
        caption,
        hashtags,
      },
      commerce,
      readiness: {
        ready_for_manual_publish: blockingItems.length === 0,
        blocking_items: blockingItems,
        manual_actions: manualActions,
      },
      files,
    };

    await mkdir(this.directory, { recursive: true });
    await mkdir(temporaryDirectory);
    try {
      await Promise.all([
        writeFile(
          path.join(temporaryDirectory, "01-发布文案.txt"),
          `${caption}\n`,
          "utf8",
        ),
        writeFile(
          path.join(temporaryDirectory, "02-短视频脚本.md"),
          renderScriptMarkdown(script, direction, source.productInsight),
          "utf8",
        ),
        writeFile(
          path.join(temporaryDirectory, "03-带货关联清单.md"),
          renderCommerceChecklist(record),
          "utf8",
        ),
        ...(source.livePlaybook
          ? [
              writeFile(
                path.join(temporaryDirectory, "04-直播参考.md"),
                renderLiveReference(source.livePlaybook),
                "utf8",
              ),
            ]
          : []),
        writeManifest(temporaryDirectory, record),
      ]);
      await rename(temporaryDirectory, finalDirectory);
      return record;
    } catch (error) {
      await rm(temporaryDirectory, { force: true, recursive: true });
      throw error;
    }
  }

  async get(packageId: string): Promise<ChannelPublishPackage> {
    const packageDirectory = this.resolvePackageDirectory(packageId);
    let raw: string;
    try {
      raw = await readFile(
        path.join(packageDirectory, "manifest.json"),
        "utf8",
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new VcaError(
          "PUBLISH_PACKAGE_NOT_FOUND",
          `Publish package "${packageId}" was not found.`,
        );
      }
      throw error;
    }
    try {
      return channelPublishPackageSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new VcaError(
        "PUBLISH_PACKAGE_INVALID",
        `Publish package "${packageId}" is invalid.`,
        error,
      );
    }
  }

  async list(): Promise<ChannelPublishPackage[]> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, {
      withFileTypes: true,
    });
    const packages = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() && packageIdPattern.test(entry.name),
        )
        .map((entry) => this.get(entry.name)),
    );
    return packages.sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );
  }

  async attachVideo(
    packageId: string,
    input: AttachChannelVideoInput,
  ): Promise<ChannelPublishPackage> {
    const record = await this.get(packageId);
    if (record.video) {
      throw new VcaError(
        "PUBLISH_VIDEO_ALREADY_ATTACHED",
        "This publish package already contains a finished video.",
      );
    }
    if (
      input.declaredBytes !== undefined &&
      (!Number.isSafeInteger(input.declaredBytes) ||
        input.declaredBytes <= 0 ||
        input.declaredBytes > maximumVideoBytes)
    ) {
      throw new VcaError(
        "PUBLISH_VIDEO_SIZE_INVALID",
        `Video size must be between 1 byte and ${maximumVideoBytes} bytes.`,
      );
    }

    const extension = path.extname(path.basename(input.filename)).toLowerCase();
    const expectedType =
      videoTypeByExtension[
        extension as keyof typeof videoTypeByExtension
      ];
    if (!expectedType || input.mediaType !== expectedType) {
      throw new VcaError(
        "PUBLISH_VIDEO_TYPE_INVALID",
        "Only matching MP4, MOV, or WebM video files are accepted.",
      );
    }

    const packageDirectory = this.resolvePackageDirectory(packageId);
    const finalName = `05-成片${extension}`;
    const finalPath = path.join(packageDirectory, finalName);
    const temporaryPath = path.join(
      packageDirectory,
      `.${randomUUID()}.uploading`,
    );
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        this.push(chunk);
        callback();
      },
    });
    let receivedBytes = 0;
    limiter.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maximumVideoBytes) {
        limiter.destroy(
          new VcaError(
            "PUBLISH_VIDEO_TOO_LARGE",
            `Video exceeds the ${maximumVideoBytes} byte limit.`,
          ),
        );
      }
    });

    try {
      await pipeline(
        input.source,
        limiter,
        createWriteStream(temporaryPath, { flags: "wx" }),
      );
      if (receivedBytes === 0) {
        throw new VcaError(
          "PUBLISH_VIDEO_EMPTY",
          "The uploaded video is empty.",
        );
      }
      if (
        input.declaredBytes !== undefined &&
        receivedBytes !== input.declaredBytes
      ) {
        throw new VcaError(
          "PUBLISH_VIDEO_SIZE_MISMATCH",
          "The uploaded video size does not match Content-Length.",
        );
      }
      await assertVideoSignature(temporaryPath, expectedType);
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlinkIfExists(temporaryPath);
      throw error;
    }

    const updated: ChannelPublishPackage = {
      ...record,
      status: "video_attached",
      updated_at: new Date().toISOString(),
      files: [...record.files, finalName],
      readiness: {
        ...record.readiness,
        ready_for_manual_publish:
          record.readiness.blocking_items.filter(
            (item) => item !== "尚未附加可发布成片。",
          ).length === 0,
        blocking_items: record.readiness.blocking_items.filter(
          (item) => item !== "尚未附加可发布成片。",
        ),
      },
      video: {
        name: path.basename(input.filename),
        relative_path: finalName,
        media_type: expectedType,
        size_bytes: receivedBytes,
      },
    };
    await writeManifest(packageDirectory, updated);
    return updated;
  }

  async directoryPath(packageId: string): Promise<string> {
    const record = await this.get(packageId);
    const packageDirectory = this.resolvePackageDirectory(packageId);
    if (!(await stat(packageDirectory)).isDirectory()) {
      throw new VcaError(
        "PUBLISH_PACKAGE_NOT_FOUND",
        `Publish package "${packageId}" was not found.`,
      );
    }
    return record.directory_path;
  }

  createVideoReadStream(packageId: string): Promise<Readable> {
    return this.get(packageId).then((record) => {
      if (!record.video) {
        throw new VcaError(
          "PUBLISH_VIDEO_NOT_FOUND",
          "This publish package does not contain a video.",
        );
      }
      return createReadStream(
        path.join(
          this.resolvePackageDirectory(packageId),
          record.video.relative_path,
        ),
      );
    });
  }

  private resolvePackageDirectory(packageId: string): string {
    if (!packageIdPattern.test(packageId)) {
      throw new VcaError(
        "PUBLISH_PACKAGE_ID_INVALID",
        `Publish package id "${packageId}" is not valid.`,
      );
    }
    return path.join(this.directory, packageId);
  }
}

function parseSourceArtifacts(
  request: CreateChannelPublishPackageRequest,
) {
  const initialInput = asRecord(request.run.initialInput);
  const product = productAgentInputSchema.parse(initialInput.product);
  const productInsight = productAgentOutputSchema.parse(
    request.run.artifacts.product_analysis,
  );
  const contentPlan = contentAgentOutputSchema.parse(
    request.run.artifacts.content_plan,
  );
  const scriptBundle = scriptAgentOutputSchema.parse(
    request.run.artifacts.script_bundle,
  );
  const liveResult = liveAgentOutputSchema.safeParse(
    request.run.artifacts.live_playbook,
  );
  return {
    product,
    productInsight,
    contentPlan,
    scriptBundle,
    livePlaybook: liveResult.success ? liveResult.data : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new VcaError(
      "PUBLISH_RUN_INPUT_INVALID",
      "Workflow run does not contain a valid initial input.",
    );
  }
  return value as Record<string, unknown>;
}

function findSelectedDirection(
  directions: ContentDirection[],
  selectedDirectionId: string,
): ContentDirection {
  const direction = directions.find(
    (candidate) => candidate.direction_id === selectedDirectionId,
  );
  if (!direction) {
    throw new VcaError(
      "PUBLISH_DIRECTION_NOT_FOUND",
      `Selected direction "${selectedDirectionId}" is missing.`,
    );
  }
  return direction;
}

function selectScript(
  scripts: ReturnType<typeof scriptAgentOutputSchema.parse>["scripts"],
  duration: 15 | 30 | 60,
): ScriptVersion {
  if (duration === 15) {
    return scripts.fifteen_seconds;
  }
  if (duration === 30) {
    return scripts.thirty_seconds;
  }
  return scripts.sixty_seconds;
}

function buildHashtags(
  category: string,
  productName: string,
  theme: string,
): string[] {
  const categoryLabels: Record<string, string> = {
    beauty: "美妆",
    clothing: "穿搭",
    food: "食品",
    home: "家居",
    jewelry: "珠宝",
    maternal_baby: "母婴",
  };
  return [
    "#视频号",
    `#${categoryLabels[category] ?? "好物分享"}`,
    toHashtag(productName),
    toHashtag(theme),
  ].filter((value, index, all) => all.indexOf(value) === index);
}

function toHashtag(value: string): string {
  const normalized = value
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 16);
  return `#${normalized || "好物分享"}`;
}

function formatPrice(amount: number, currency: string): string {
  return currency === "CNY"
    ? `¥${amount.toFixed(2)}`
    : `${currency} ${amount.toFixed(2)}`;
}

function buildManualActions(
  mode: CreateChannelPublishPackageRequest["commerce"]["mode"],
): string[] {
  const actions = [
    "在浏览器打开微信官方视频号助手，并确认当前登录的是目标视频号。",
    "进入发表视频，上传本发布包中的成片，粘贴“01-发布文案.txt”。",
  ];
  if (mode === "wechat_store_product") {
    actions.push(
      "在发布页打开“带货/商品”，进入带货助手并选择清单中的微信小店商品。",
      "逐项核对商品名称、规格、页面价格、实时库存和优惠有效期。",
    );
  } else if (mode === "manual_product_selection") {
    actions.push(
      "在发布页的商品入口手动搜索清单中的商品或 SKU，并完成关联。",
      "逐项核对商品名称、规格、页面价格、实时库存和优惠有效期。",
    );
  }
  actions.push(
    "预览封面、字幕、声音、商品卡和可见范围。",
    "由账号运营人员完成最终发布确认；本机助手不会自动点击发布。",
  );
  return actions;
}

function renderScriptMarkdown(
  script: ScriptVersion,
  direction: ContentDirection,
  productInsight: ReturnType<typeof productAgentOutputSchema.parse>,
): string {
  const shots = script.shots
    .map(
      (shot, index) => [
        `### 镜头 ${index + 1}（${shot.start_second}–${shot.end_second} 秒）`,
        "",
        `- 画面：${shot.visual}`,
        `- 人物：${shot.character}`,
        `- 动作：${shot.action}`,
        `- 台词：${shot.dialogue}`,
        `- 商品展示：${shot.product_display}`,
        `- 声音：${shot.audio_cue}`,
      ].join("\n"),
    )
    .join("\n\n");
  return [
    `# ${script.duration_seconds} 秒短视频脚本`,
    "",
    `- 内容方向：${direction.theme}`,
    `- 叙事方式：${direction.narrative_mode}`,
    `- 开头 Hook：${script.hook}`,
    `- 场景：${script.scene}`,
    `- 人物设定：${script.character_setup}`,
    `- 市场定位：${productInsight.market_positioning.statement}`,
    "",
    shots,
    "",
    "## 商品展示",
    "",
    script.product_showcase,
    "",
    "## 成交引导",
    "",
    script.closing_cta,
    "",
    "## 表演提示",
    "",
    ...script.performance_notes.map((note) => `- ${note}`),
    "",
    "## 事实与风险",
    "",
    ...script.fact_check.claims_used.map(
      (claim) =>
        `- ${claim.claim}（依据：${claim.basis}；状态：${claim.evidence_status}）`,
    ),
    ...script.fact_check.risk_notes.map((note) => `- 风险：${note}`),
    "",
  ].join("\n");
}

function renderCommerceChecklist(record: ChannelPublishPackage): string {
  const modeLabels = {
    manual_product_selection: "发布页手动选品",
    none: "本条视频不关联商品",
    wechat_store_product: "微信小店带货助手",
  };
  return [
    "# 视频号带货关联清单",
    "",
    `- 目标视频号：${record.channel.display_name}`,
    `- 商品名称：${record.commerce.product_name ?? record.product.name}`,
    `- 工作流参考价：${record.product.price_display}`,
    `- 关联方式：${modeLabels[record.commerce.mode]}`,
    `- 商品 ID / SKU：${record.commerce.product_id_or_sku ?? "未填写，发布时按名称搜索"}`,
    `- 运营备注：${record.commerce.notes ?? "无"}`,
    `- 发布前关联确认：${record.commerce.linkage_confirmed ? "已确认" : "待确认"}`,
    "",
    "## 操作步骤",
    "",
    ...record.readiness.manual_actions.map(
      (action, index) => `${index + 1}. ${action}`,
    ),
    "",
    "## 强制核对",
    "",
    "- [ ] 当前登录视频号与目标视频号一致",
    "- [ ] 商品名称与商品卡一致",
    "- [ ] 规格、页面价格和实际库存一致",
    "- [ ] 优惠已在后台生效且截止时间真实",
    "- [ ] 商品卡可以从发布预览正常打开",
    "- [ ] 文案没有超出已确认商品事实",
    "- [ ] 最终发布由账号运营人员人工确认",
    "",
    "> 本清单连接的是内容工作流和视频号带货助手的人工交接，不读取微信本机登录数据，也不调用未公开接口。",
    "",
  ].join("\n");
}

function renderLiveReference(
  live: ReturnType<typeof liveAgentOutputSchema.parse>,
): string {
  return [
    "# 直播参考",
    "",
    "## 开场五分钟",
    "",
    ...live.opening_five_minutes.flatMap((minute) => [
      `### 第 ${minute.minute} 分钟`,
      "",
      `- 目标：${minute.objective}`,
      `- 主播：${minute.host_script}`,
      `- 互动：${minute.interaction}`,
      `- 商品动作：${minute.product_action}`,
      "",
    ]),
    "## 下单引导",
    "",
    ...live.order_guidance.map(
      (item) => `${item.step}. ${item.script}`,
    ),
    "",
  ].join("\n");
}

async function writeManifest(
  directory: string,
  record: ChannelPublishPackage,
): Promise<void> {
  const parsed = channelPublishPackageSchema.parse(record);
  const temporary = path.join(
    directory,
    `.manifest.${randomUUID()}.tmp`,
  );
  const target = path.join(directory, "manifest.json");
  await writeFile(
    temporary,
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  const backup = path.join(directory, `.manifest.${randomUUID()}.bak`);
  let hasBackup = false;
  try {
    try {
      await rename(target, backup);
      hasBackup = true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    await rename(temporary, target);
    if (hasBackup) {
      await unlinkIfExists(backup);
    }
  } catch (error) {
    await unlinkIfExists(temporary);
    if (hasBackup) {
      try {
        await rename(backup, target);
      } catch {
        // Preserve the replacement error. The backup remains recoverable.
      }
    }
    throw error;
  }
}

async function assertVideoSignature(
  file: string,
  mediaType: SupportedVideoType,
): Promise<void> {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const valid =
      mediaType === "video/webm"
        ? bytesRead >= 4 &&
          header.subarray(0, 4).equals(
            Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          )
        : bytesRead >= 12 && header.subarray(4, 8).toString() === "ftyp";
    if (!valid) {
      throw new VcaError(
        "PUBLISH_VIDEO_SIGNATURE_INVALID",
        "The uploaded file does not match its declared video format.",
      );
    }
  } finally {
    await handle.close();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function unlinkIfExists(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}
