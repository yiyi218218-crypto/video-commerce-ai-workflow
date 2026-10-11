import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  copyFile,
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
  productVideoProjectSchema,
  type ProductVideoProject,
} from "../../schemas/product-video-project.schema.js";
import type { SelectionBatch } from "../../schemas/product-selection.schema.js";
import type { CreativeDirectorOutput } from "../../schemas/creative-production.schema.js";
import {
  buildProductVideoCreativeBrief,
  renderHyperframesConfig,
  renderHyperframesDesign,
  renderHyperframesIndex,
} from "./hyperframes-product-story.js";
import { writeAmbientBgm } from "./ambient-bgm.js";
import type { SpeechSynthesizer } from "./windows-speech-synthesizer.js";

const projectIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumRenderedVideoBytes = 500 * 1024 * 1024;
const maximumImageBytes = 8 * 1024 * 1024;
const allowedImageHosts = [
  "mmecimage.cn",
  "qpic.cn",
  "qq.com",
  "weixin.qq.com",
  "weixinbridge.com",
  "wxqcloud.qq.com",
];

export interface RenderedVideoUpload {
  mediaType: string;
  source: Readable;
  declaredBytes?: number;
}

export interface VideoProjectAsset {
  file: string;
  mediaType: string;
}

export interface ProductVideoProjectStoreOptions {
  directory: string;
  speechSynthesizer: SpeechSynthesizer;
  fetchImplementation?: typeof fetch;
}

export class ProductVideoProjectStore {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ProductVideoProjectStoreOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async create(
    batch: SelectionBatch,
    candidateId: string,
    creativeProduction?: CreativeDirectorOutput,
  ): Promise<ProductVideoProject> {
    if (batch.status !== "analyzed" || !batch.analysis) {
      throw new VcaError(
        "VIDEO_SELECTION_NOT_ANALYZED",
        "Product selection analysis must finish before creating a video.",
      );
    }
    const candidate = batch.candidates.find(
      (item) => item.candidate_id === candidateId,
    );
    const recommendation = batch.analysis.ranking.find(
      (item) => item.candidate_id === candidateId,
    );
    if (!candidate || !recommendation) {
      throw new VcaError(
        "VIDEO_CANDIDATE_NOT_RECOMMENDED",
        "The selected candidate is not present in the analyzed ranking.",
      );
    }

    const id = randomUUID();
    const finalDirectory = this.resolveProjectDirectory(id);
    const temporaryDirectory = path.join(
      this.options.directory,
      `.${id}.${randomUUID()}.tmp`,
    );
    const now = new Date().toISOString();
    const warnings: string[] = [];
    if (creativeProduction?.production_readiness === "needs_assets") {
      warnings.push(
        "Creative direction is ready, but real product or usage assets are required before a publishable render can be generated.",
      );
    }
    await mkdir(this.options.directory, { recursive: true });
    await mkdir(temporaryDirectory);
    await mkdir(path.join(temporaryDirectory, "hyperframes"));
    await mkdir(path.join(temporaryDirectory, "hyperframes", "assets"));

    try {
      const image = await this.prepareImage(
        temporaryDirectory,
        candidate.image_url,
        candidate.product_name,
        warnings,
      );
      const gallery = await this.prepareGallery(
        temporaryDirectory,
        candidate.gallery_image_urls ?? [],
        image,
        warnings,
      );
      const narrationTextFile = path.join(
        temporaryDirectory,
        "narration.txt",
      );
      const narrationFile = path.join(
        temporaryDirectory,
        "narration.wav",
      );
      const bgmFile = path.join(temporaryDirectory, "bgm.wav");
      await writeFile(
        narrationTextFile,
        `${creativeProduction
          ? creativeProduction.beats.map((beat) => beat.voiceover).join("")
          : recommendation.video_plan.voiceover}\n`,
        "utf8",
      );
      let narration:
        | { relative_path: string; media_type: string }
        | undefined;
      try {
        await this.options.speechSynthesizer.synthesize(
          narrationTextFile,
          narrationFile,
        );
        narration = {
          relative_path: "narration.wav",
          media_type: "audio/wav",
        };
      } catch {
        warnings.push(
          "本机中文语音生成失败，成片将保留字幕但不含旁白。",
        );
      }
      let bgm: { relative_path: string; media_type: string } | undefined;
      try {
        await writeAmbientBgm(bgmFile);
        bgm = { relative_path: "bgm.wav", media_type: "audio/wav" };
      } catch {
        warnings.push("本机氛围 BGM 生成失败，成片将在无背景音乐状态下等待补充音频资产。");
      }

      const galleryOnly = gallery.filter(
        (asset) => asset.relative_path !== image.relative_path,
      );
      const files = [
        "01-选品报告.json",
        "02-视频文案.txt",
        "03-带货关联清单.md",
        ...(creativeProduction
          ? ["04-创意生产包.json", "hyperframes/STORYBOARD.md"]
          : []),
        "hyperframes/DESIGN.md",
        `hyperframes/assets/${image.relative_path}`,
        ...galleryOnly.map(
          (asset) => `hyperframes/assets/${asset.relative_path}`,
        ),
        ...(narration
          ? [`hyperframes/assets/${narration.relative_path}`]
          : []),
        ...(bgm ? [`hyperframes/assets/${bgm.relative_path}`] : []),
        "hyperframes/hyperframes.json",
        "hyperframes/index.html",
        "manifest.json",
        image.relative_path,
        ...galleryOnly.map((asset) => asset.relative_path),
        "narration.txt",
        ...(narration ? [narration.relative_path] : []),
        ...(bgm ? [bgm.relative_path] : []),
      ];
      const creativeBrief = buildProductVideoCreativeBrief(recommendation);
      const record: ProductVideoProject = {
        id,
        status: "prepared",
        batch_id: batch.id,
        candidate,
        recommendation,
        created_at: now,
        updated_at: now,
        directory_path: finalDirectory,
        assets: {
          image,
          gallery,
          ...(narration ? { narration } : {}),
          ...(bgm ? { bgm } : {}),
        },
        creative_brief: creativeBrief,
        ...(creativeProduction ? { creative_production: creativeProduction } : {}),
        hyperframes: {
          composition_id: "vca-product-story",
          entry_relative_path: "hyperframes/index.html",
          design_relative_path: "hyperframes/DESIGN.md",
          config_relative_path: "hyperframes/hyperframes.json",
          render_note:
            "HyperFrames 源工程已生成；安装 FFmpeg 与 Headless Chrome 后可在 hyperframes 目录执行 npx hyperframes lint/inspect/render。",
        },
        warnings,
        files,
      };
      await Promise.all([
        writeFile(
          path.join(temporaryDirectory, "01-选品报告.json"),
          `${JSON.stringify(
            {
              candidate,
              recommendation,
              data_limitations: batch.analysis.data_limitations,
            },
            null,
            2,
          )}\n`,
          "utf8",
        ),
        writeFile(
          path.join(temporaryDirectory, "02-视频文案.txt"),
          renderVideoCopy(record),
          "utf8",
        ),
        writeFile(
          path.join(temporaryDirectory, "03-带货关联清单.md"),
          renderCommerceChecklist(record),
          "utf8",
        ),
        ...(creativeProduction
          ? [
              writeFile(
                path.join(temporaryDirectory, "04-创意生产包.json"),
                `${JSON.stringify(creativeProduction, null, 2)}\n`,
                "utf8",
              ),
              writeFile(
                path.join(temporaryDirectory, "hyperframes", "STORYBOARD.md"),
                renderCreativeStoryboard(creativeProduction),
                "utf8",
              ),
            ]
          : []),
        writeFile(
          path.join(temporaryDirectory, "hyperframes", "DESIGN.md"),
          renderHyperframesDesign(),
          "utf8",
        ),
        copyFile(
          path.join(temporaryDirectory, image.relative_path),
          path.join(
            temporaryDirectory,
            "hyperframes",
            "assets",
            image.relative_path,
          ),
        ),
        ...galleryOnly.map((asset) =>
          copyFile(
            path.join(temporaryDirectory, asset.relative_path),
            path.join(
              temporaryDirectory,
              "hyperframes",
              "assets",
              asset.relative_path,
            ),
          ),
        ),
        ...(narration
          ? [
              copyFile(
                path.join(temporaryDirectory, narration.relative_path),
                path.join(
                  temporaryDirectory,
                  "hyperframes",
                  "assets",
                  narration.relative_path,
                ),
              ),
            ]
          : []),
        ...(bgm
          ? [
              copyFile(
                path.join(temporaryDirectory, bgm.relative_path),
                path.join(
                  temporaryDirectory,
                  "hyperframes",
                  "assets",
                  bgm.relative_path,
                ),
              ),
            ]
          : []),
        writeFile(
          path.join(
            temporaryDirectory,
            "hyperframes",
            "hyperframes.json",
          ),
          renderHyperframesConfig(),
          "utf8",
        ),
        writeFile(
          path.join(temporaryDirectory, "hyperframes", "index.html"),
          renderHyperframesIndex(record),
          "utf8",
        ),
        writeManifest(temporaryDirectory, record),
      ]);
      await rename(temporaryDirectory, finalDirectory);
      return record;
    } catch (error) {
      await rm(temporaryDirectory, { force: true, recursive: true });
      throw error;
    }
  }

  async get(projectId: string): Promise<ProductVideoProject> {
    const directory = this.resolveProjectDirectory(projectId);
    try {
      return productVideoProjectSchema.parse(
        JSON.parse(
          await readFile(path.join(directory, "manifest.json"), "utf8"),
        ),
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new VcaError(
          "VIDEO_PROJECT_NOT_FOUND",
          `Video project "${projectId}" was not found.`,
        );
      }
      if (error instanceof SyntaxError || !isNodeError(error)) {
        throw new VcaError(
          "VIDEO_PROJECT_INVALID",
          `Video project "${projectId}" is invalid.`,
          error,
        );
      }
      throw error;
    }
  }

  async list(): Promise<ProductVideoProject[]> {
    await mkdir(this.options.directory, { recursive: true });
    const entries = await readdir(this.options.directory, {
      withFileTypes: true,
    });
    const projects = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() && projectIdPattern.test(entry.name),
        )
        .map((entry) => this.get(entry.name)),
    );
    return projects.sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );
  }

  async attachRenderedVideo(
    projectId: string,
    upload: RenderedVideoUpload,
  ): Promise<ProductVideoProject> {
    const record = await this.get(projectId);
    if (record.rendered_video) {
      throw new VcaError(
        "VIDEO_PROJECT_ALREADY_RENDERED",
        "This product video project already contains a rendered video.",
      );
    }
    const normalizedMediaType =
      upload.mediaType === "video/webm" ||
      upload.mediaType === "video/mp4"
        ? upload.mediaType
        : null;
    if (!normalizedMediaType) {
      throw new VcaError(
        "VIDEO_RENDER_TYPE_INVALID",
        "Rendered video must be WebM or MP4.",
      );
    }
    const extension =
      normalizedMediaType === "video/webm" ? ".webm" : ".mp4";
    if (
      upload.declaredBytes !== undefined &&
      (!Number.isSafeInteger(upload.declaredBytes) ||
        upload.declaredBytes <= 0 ||
        upload.declaredBytes > maximumRenderedVideoBytes)
    ) {
      throw new VcaError(
        "VIDEO_RENDER_SIZE_INVALID",
        "Rendered video size is invalid.",
      );
    }

    const directory = this.resolveProjectDirectory(projectId);
    const finalName = `04-自动成片${extension}`;
    const finalPath = path.join(directory, finalName);
    const temporaryPath = path.join(
      directory,
      `.${randomUUID()}.rendering`,
    );
    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > maximumRenderedVideoBytes) {
          callback(
            new VcaError(
              "VIDEO_RENDER_TOO_LARGE",
              "Rendered video exceeds the 500 MB limit.",
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        upload.source,
        limiter,
        createWriteStream(temporaryPath, { flags: "wx" }),
      );
      if (receivedBytes === 0) {
        throw new VcaError(
          "VIDEO_RENDER_EMPTY",
          "Rendered video is empty.",
        );
      }
      if (
        upload.declaredBytes !== undefined &&
        upload.declaredBytes !== receivedBytes
      ) {
        throw new VcaError(
          "VIDEO_RENDER_SIZE_MISMATCH",
          "Rendered video size does not match Content-Length.",
        );
      }
      await assertVideoSignature(temporaryPath, normalizedMediaType);
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlinkIfExists(temporaryPath);
      throw error;
    }

    const updated: ProductVideoProject = {
      ...record,
      status: "video_ready",
      updated_at: new Date().toISOString(),
      rendered_video: {
        relative_path: finalName,
        media_type: normalizedMediaType,
        size_bytes: receivedBytes,
      },
      files: [...record.files, finalName],
    };
    await writeManifest(directory, updated);
    return updated;
  }

  async asset(
    projectId: string,
    kind: "image" | "narration",
  ): Promise<VideoProjectAsset> {
    const record = await this.get(projectId);
    const asset =
      kind === "image" ? record.assets.image : record.assets.narration;
    if (!asset) {
      throw new VcaError(
        "VIDEO_PROJECT_ASSET_NOT_FOUND",
        `Video project does not contain a ${kind} asset.`,
      );
    }
    const file = path.join(
      this.resolveProjectDirectory(projectId),
      asset.relative_path,
    );
    if (!(await stat(file)).isFile()) {
      throw new VcaError(
        "VIDEO_PROJECT_ASSET_NOT_FOUND",
        `Video project does not contain a ${kind} asset.`,
      );
    }
    return { file, mediaType: asset.media_type };
  }

  async directoryPath(projectId: string): Promise<string> {
    return (await this.get(projectId)).directory_path;
  }

  private async prepareImage(
    directory: string,
    imageUrl: string | undefined,
    productName: string,
    warnings: string[],
  ): Promise<{ relative_path: string; media_type: string }> {
    if (imageUrl) {
      try {
        const downloaded = await downloadImage(
          imageUrl,
          this.fetchImplementation,
        );
        const extension = imageExtension(downloaded.mediaType);
        const relativePath = `product-image${extension}`;
        await writeFile(
          path.join(directory, relativePath),
          downloaded.body,
        );
        return {
          relative_path: relativePath,
          media_type: downloaded.mediaType,
        };
      } catch {
        warnings.push(
          "商品主图无法安全下载，自动成片使用商品名称占位卡。",
        );
      }
    } else {
      warnings.push("候选商品没有可用主图，自动成片使用商品名称占位卡。");
    }

    const relativePath = "product-image.svg";
    await writeFile(
      path.join(directory, relativePath),
      placeholderSvg(productName),
      "utf8",
    );
    return {
      relative_path: relativePath,
      media_type: "image/svg+xml",
    };
  }

  private async prepareGallery(
    directory: string,
    imageUrls: string[],
    primary: { relative_path: string; media_type: string },
    warnings: string[],
  ): Promise<Array<{ relative_path: string; media_type: string }>> {
    const assets = [primary];
    const fingerprints = new Set<string>();
    try {
      fingerprints.add(
        createHash("sha256")
          .update(await readFile(path.join(directory, primary.relative_path)))
          .digest("hex"),
      );
    } catch {
      // The primary asset is still retained; gallery enrichment remains optional.
    }

    for (const imageUrl of [...new Set(imageUrls)].slice(0, 12)) {
      try {
        const downloaded = await downloadImage(imageUrl, this.fetchImplementation);
        const fingerprint = createHash("sha256")
          .update(downloaded.body)
          .digest("hex");
        if (fingerprints.has(fingerprint)) {
          continue;
        }
        fingerprints.add(fingerprint);
        const extension = imageExtension(downloaded.mediaType);
        const relativePath = `product-gallery-${String(assets.length).padStart(2, "0")}${extension}`;
        await writeFile(path.join(directory, relativePath), downloaded.body);
        assets.push({
          relative_path: relativePath,
          media_type: downloaded.mediaType,
        });
      } catch {
        warnings.push("一张详情商品图无法安全下载，已跳过该图片。");
      }
    }
    if (assets.length < 4) {
      warnings.push(
        `当前只有 ${assets.length} 张独立商品视觉素材；仅允许创意/规格审片，不允许生成发布级成片。`,
      );
    }
    return assets;
  }

  private resolveProjectDirectory(projectId: string): string {
    if (!projectIdPattern.test(projectId)) {
      throw new VcaError(
        "VIDEO_PROJECT_ID_INVALID",
        `Video project id "${projectId}" is not valid.`,
      );
    }
    return path.join(this.options.directory, projectId);
  }
}

async function downloadImage(
  initialUrl: string,
  fetchImplementation: typeof fetch,
): Promise<{ body: Buffer; mediaType: string }> {
  let currentUrl = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const url = new URL(currentUrl);
    if (
      url.protocol !== "https:" ||
      !allowedImageHosts.some(
        (host) =>
          url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    ) {
      throw new VcaError(
        "VIDEO_IMAGE_HOST_NOT_ALLOWED",
        "Product image host is not allowlisted.",
      );
    }
    const response = await fetchImplementation(url, {
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new VcaError(
          "VIDEO_IMAGE_REDIRECT_INVALID",
          "Product image redirect is missing a location.",
        );
      }
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) {
      throw new VcaError(
        "VIDEO_IMAGE_DOWNLOAD_FAILED",
        `Product image returned HTTP ${response.status}.`,
      );
    }
    const mediaType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim();
    if (
      mediaType !== "image/jpeg" &&
      mediaType !== "image/png" &&
      mediaType !== "image/webp" &&
      mediaType !== "image/avif"
    ) {
      throw new VcaError(
        "VIDEO_IMAGE_TYPE_INVALID",
        "Product image format is not supported.",
      );
    }
    const declaredBytes = Number(
      response.headers.get("content-length") ?? 0,
    );
    if (declaredBytes > maximumImageBytes) {
      throw new VcaError(
        "VIDEO_IMAGE_TOO_LARGE",
        "Product image exceeds the 8 MB limit.",
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0 || body.length > maximumImageBytes) {
      throw new VcaError(
        "VIDEO_IMAGE_SIZE_INVALID",
        "Product image size is invalid.",
      );
    }
    return { body, mediaType };
  }
  throw new VcaError(
    "VIDEO_IMAGE_REDIRECT_LIMIT",
    "Product image exceeded the redirect limit.",
  );
}

function imageExtension(mediaType: string): string {
  const extensions: Record<string, string> = {
    "image/avif": ".avif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return extensions[mediaType] ?? ".img";
}

function placeholderSvg(productName: string): string {
  const safeName = escapeXml(productName.slice(0, 40));
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17362f"/><stop offset="1" stop-color="#ec6f3f"/></linearGradient></defs>',
    '<rect width="720" height="960" rx="42" fill="url(#g)"/>',
    '<circle cx="570" cy="170" r="180" fill="rgba(255,255,255,.08)"/>',
    '<text x="70" y="420" fill="#fff" font-size="36" font-family="Microsoft YaHei, sans-serif">微信小店候选商品</text>',
    `<text x="70" y="490" fill="#fff" font-size="46" font-weight="700" font-family="Microsoft YaHei, sans-serif">${safeName}</text>`,
    '<text x="70" y="820" fill="rgba(255,255,255,.75)" font-size="24" font-family="Microsoft YaHei, sans-serif">发布前请核对商品主图与详情</text>',
    "</svg>",
  ].join("");
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '"': "&quot;",
      "'": "&apos;",
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return entities[character] ?? character;
  });
}

function renderVideoCopy(project: ProductVideoProject): string {
  const plan = project.recommendation.video_plan;
  const brief = project.creative_brief;
  return [
    "# 创意短视频分镜",
    "",
    "## 开场原则",
    "",
    "- 先讲生活矛盾，不要先露商品价格。",
    "- 商品只在真实动作里出现，避免广告口播。",
    "- 所有价格、佣金、库存、规格都按发布页二次核对。",
    "",
    "## 15 秒旁白",
    "",
    plan.voiceover,
    "",
    "## 四段结构",
    "",
    ...(brief?.scenes ?? [])
      .map((scene, index) =>
        [
          `${index + 1}. ${scene.start_second}s-${scene.end_second}s · ${scene.kicker}`,
          `   - 大字：${scene.headline}`,
          `   - 小字：${scene.subline}`,
          `   - 节奏：${scene.motion}`,
        ].join("\n"),
      )
      .flatMap((value) => [value, ""]),
    "## 结尾引导",
    "",
    plan.call_to_action,
    "",
    "## 标签建议",
    "",
    "#真实场景 #视频号好物 #微信小店 #先核对再下单",
    "",
  ].join("\n");
}

function renderCreativeStoryboard(production: CreativeDirectorOutput): string {
  return [
    "# 创意生产分镜",
    "",
    `- 主题：${production.one_sentence_promise}`,
    `- 情绪：${production.emotional_arc}`,
    `- BGM：${production.bgm_direction}`,
    "",
    "## 分镜",
    "",
    ...production.beats.flatMap((beat) => [
      `### ${beat.start_second}s–${beat.end_second}s · ${beat.story_role}`,
      `- 镜头：${beat.shot_type}；${beat.action}`,
      `- 画面字幕：${beat.on_screen_text}`,
      `- 旁白：${beat.voiceover}`,
      `- 转场：${beat.transition}`,
      "",
    ]),
  ].join("\n");
}

function renderCommerceChecklist(
  project: ProductVideoProject,
): string {
  const candidate = project.candidate;
  return [
    "# 微信小店带货关联清单",
    "",
    `- 商品：${candidate.product_name}`,
    `- 页面价格：${candidate.price_amount ?? "待核对"}`,
    `- 页面佣金率：${candidate.commission_rate ?? "待核对"}`,
    `- 页面销量：${candidate.sold_count ?? "待核对"}`,
    `- 商品链接：${candidate.source_url ?? "回到原选品页面查找"}`,
    "",
    "## 人工确认",
    "",
    "- [ ] 在微信小店带货助手中打开原商品详情",
    "- [ ] 核对店铺资质、商品规格、实时价格、库存与佣金规则",
    "- [ ] 核对退货政策、平台限制和选品合作状态",
    "- [ ] 点击“带货/加入橱窗”前确认商品与本项目一致",
    "- [ ] 发布视频时再次核对关联商品卡",
    "",
    "> 自动选品结果仅用于内容测试决策，不构成商品质量或收益保证。",
    "",
  ].join("\n");
}

async function writeManifest(
  directory: string,
  project: ProductVideoProject,
): Promise<void> {
  const parsed = productVideoProjectSchema.parse(project);
  const target = path.join(directory, "manifest.json");
  const temporary = path.join(
    directory,
    `.manifest.${randomUUID()}.tmp`,
  );
  const backup = path.join(
    directory,
    `.manifest.${randomUUID()}.bak`,
  );
  await writeFile(
    temporary,
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
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
        // Preserve the replacement error; backup remains recoverable.
      }
    }
    throw error;
  }
}

async function assertVideoSignature(
  file: string,
  mediaType: string,
): Promise<void> {
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    const valid =
      mediaType === "video/webm"
        ? bytesRead >= 4 &&
          header.subarray(0, 4).equals(
            Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          )
        : bytesRead >= 12 &&
          header.subarray(4, 8).toString() === "ftyp";
    if (!valid) {
      throw new VcaError(
        "VIDEO_RENDER_SIGNATURE_INVALID",
        "Rendered video does not match its declared format.",
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
