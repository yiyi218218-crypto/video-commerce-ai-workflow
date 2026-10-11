import type { ProductVideoProject } from "../schemas/product-video-project.schema.js";
import { productVideoAssetUrl } from "./product-video-api-client.js";

export interface ProductVideoRenderOptions {
  canvas: HTMLCanvasElement;
  project: ProductVideoProject;
  onProgress?: (progress: number) => void;
  fetchImplementation?: typeof fetch;
  audioContext?: AudioContext;
}

export async function renderProductVideo(
  options: ProductVideoRenderOptions,
): Promise<Blob> {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof options.canvas.captureStream !== "function"
  ) {
    throw new Error("当前浏览器不支持本机 Canvas 视频合成。");
  }
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const canvas = options.canvas;
  canvas.width = 720;
  canvas.height = 1280;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法初始化视频画布。");
  }
  const image = await loadImage(
    productVideoAssetUrl(options.project.id, "image"),
    fetchImplementation,
  );
  const durationMs =
    options.project.recommendation.video_plan.duration_seconds * 1_000;
  const stream = canvas.captureStream(30);
  const audio = options.project.assets.narration
    ? await prepareNarration(
        productVideoAssetUrl(options.project.id, "narration"),
        fetchImplementation,
        options.audioContext,
      )
    : null;
  if (!audio && options.audioContext) {
    await options.audioContext.close();
  }
  if (audio) {
    for (const track of audio.destination.stream.getAudioTracks()) {
      stream.addTrack(track);
    }
  }
  const mediaType = chooseMediaType();
  const recorder = new MediaRecorder(stream, {
    mimeType: mediaType,
    videoBitsPerSecond: 4_500_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  return new Promise<Blob>((resolve, reject) => {
    let animationFrame = 0;
    const startedAt = performance.now();
    const cleanup = () => {
      cancelAnimationFrame(animationFrame);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      if (audio) {
        try {
          audio.source.stop();
        } catch {
          // The source can already be stopped when the render ends.
        }
        void audio.context.close();
      }
    };
    recorder.addEventListener("error", () => {
      cleanup();
      reject(new Error("浏览器视频编码失败。"));
    });
    recorder.addEventListener("stop", () => {
      cleanup();
      const blob = new Blob(chunks, { type: mediaType });
      if (blob.size === 0) {
        reject(new Error("浏览器没有生成有效成片。"));
        return;
      }
      options.onProgress?.(1);
      resolve(blob);
    });

    recorder.start(1_000);
    audio?.source.start();

    const draw = (timestamp: number) => {
      const elapsed = Math.min(timestamp - startedAt, durationMs);
      const progress = elapsed / durationMs;
      drawFrame(context, canvas, image, options.project, progress);
      options.onProgress?.(progress);
      if (elapsed >= durationMs) {
        recorder.stop();
        return;
      }
      animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
  });
}

async function prepareNarration(
  url: string,
  fetchImplementation: typeof fetch,
  providedContext?: AudioContext,
): Promise<{
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  source: AudioBufferSourceNode;
}> {
  const context = providedContext ?? new AudioContext();
  await context.resume();
  const response = await fetchImplementation(url, { cache: "no-store" });
  if (!response.ok) {
    await context.close();
    throw new Error("无法读取本机旁白文件。");
  }
  const buffer = await context.decodeAudioData(
    await response.arrayBuffer(),
  );
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  return { context, destination, source };
}

async function loadImage(
  url: string,
  fetchImplementation: typeof fetch,
): Promise<HTMLImageElement> {
  const response = await fetchImplementation(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("无法读取商品主图。");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function chooseMediaType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mediaType = candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
  if (!mediaType) {
    throw new Error("当前浏览器没有可用的 WebM 编码器。");
  }
  return mediaType;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  project: ProductVideoProject,
  progress: number,
): void {
  const plan = project.recommendation.video_plan;
  const second = progress * plan.duration_seconds;
  const scenes = storyScenes(project);
  const sceneIndex = Math.max(
    0,
    scenes.findIndex(
      (item) => second >= item.start_second && second < item.end_second,
    ),
  );
  const scene = scenes[sceneIndex] ?? scenes.at(-1);
  if (!scene) {
    return;
  }
  const sceneDuration = scene.end_second - scene.start_second;
  const localProgress = clamp(
    (second - scene.start_second) / sceneDuration,
    0,
    1,
  );
  const intro = easeOutCubic(clamp(localProgress / 0.28, 0, 1));
  const transition = transitionAmount(second, scenes);

  context.fillStyle = "#18110d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawEditorialBackground(context, canvas, progress, sceneIndex);

  const imageX = 245 + (1 - intro) * 90;
  const imageY = scene.beat === "contradiction" ? 120 : 96;
  const imageRotation =
    (scene.beat === "test" ? -0.05 : 0.06) + (1 - intro) * 0.07;
  context.save();
  context.translate(imageX + 205, imageY + 280);
  context.rotate(imageRotation);
  context.fillStyle = "#fff3df";
  context.fillRect(-215, -290, 430, 580);
  context.fillStyle = "#ff5a2e";
  context.fillRect(-190, -266, 430, 580);
  context.beginPath();
  roundRect(context, -205, -280, 410, 560, 8);
  context.clip();
  drawImageCover(
    context,
    image,
    -205,
    -280,
    410,
    560,
    1.08 + progress * 0.05,
  );
  context.restore();

  context.save();
  context.translate((1 - intro) * -54, 0);
  context.globalAlpha = intro;
  drawKicker(context, scene.kicker, 44, 142);

  context.fillStyle = "#fff3df";
  context.shadowColor = "#3a2017";
  context.shadowBlur = 0;
  context.shadowOffsetX = 7;
  context.shadowOffsetY = 7;
  context.font =
    '900 74px "Arial Black", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  const headlineEnd = drawWrappedText(
    context,
    scene.headline,
    44,
    710,
    610,
    78,
    3,
  );
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = "#fff3df";
  context.font =
    '400 32px "KaiTi", "Microsoft YaHei", "PingFang SC", sans-serif';
  drawWrappedText(
    context,
    scene.subline,
    48,
    headlineEnd + 42,
    600,
    44,
    2,
  );
  context.restore();

  if (scene.beat === "proof") {
    drawProofStack(context, project, intro);
  }
  drawProductStrip(context, project.candidate.product_name, intro);
  drawProgressAndTimer(context, progress, second);
  drawTransition(context, canvas, transition);
}

type CanvasStoryScene = {
  start_second: number;
  end_second: number;
  beat: "contradiction" | "test" | "proof" | "invitation";
  kicker: string;
  headline: string;
  subline: string;
};

function storyScenes(project: ProductVideoProject): CanvasStoryScene[] {
  if (project.creative_brief?.scenes) {
    return project.creative_brief.scenes;
  }
  const cards = project.recommendation.video_plan.cards;
  return cards.map((card, index) => ({
    start_second: card.start_second,
    end_second: card.end_second,
    beat: (["contradiction", "test", "proof", "invitation"] as const)[
      index
    ]!,
    kicker: ["先别买", "我试了一步", "只看证据", "适合再点开"][index]!,
    headline: card.headline,
    subline: card.subline,
  }));
}

function drawEditorialBackground(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  progress: number,
  sceneIndex: number,
): void {
  const warmGlow = context.createRadialGradient(
    120,
    200 + Math.sin(progress * Math.PI * 2) * 24,
    20,
    120,
    220,
    520,
  );
  warmGlow.addColorStop(0, "rgba(255,90,46,.45)");
  warmGlow.addColorStop(1, "rgba(255,90,46,0)");
  context.fillStyle = warmGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const yellowGlow = context.createRadialGradient(620, 1020, 10, 620, 1020, 420);
  yellowGlow.addColorStop(0, "rgba(255,209,102,.25)");
  yellowGlow.addColorStop(1, "rgba(255,209,102,0)");
  context.fillStyle = yellowGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = 0.1;
  context.fillStyle = "#fff3df";
  for (let y = -40; y < canvas.height; y += 52) {
    context.fillRect(0, y + ((sceneIndex * 17) % 52), canvas.width, 2);
  }
  context.globalAlpha = 1;

  context.save();
  context.translate(32, 1030);
  context.rotate(-0.08);
  context.fillStyle = "rgba(255,243,223,.07)";
  context.font =
    '900 112px "Arial Black", "Microsoft YaHei UI", sans-serif';
  context.fillText("真实场景", 0, 0);
  context.restore();
}

function drawKicker(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(-0.045);
  context.fillStyle = "rgba(24,17,13,.82)";
  context.strokeStyle = "#ff5a2e";
  context.lineWidth = 3;
  roundRect(context, 0, 0, 176, 58, 4);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffd166";
  context.font =
    '700 30px "KaiTi", "Microsoft YaHei", "PingFang SC", sans-serif';
  context.fillText(value, 18, 39);
  context.restore();
}

function drawProofStack(
  context: CanvasRenderingContext2D,
  project: ProductVideoProject,
  intro: number,
): void {
  const facts = [
    project.candidate.price_amount
      ? `采集价 ¥${project.candidate.price_amount}`
      : "价格待核对",
    project.candidate.sold_count !== undefined
      ? `销量 ${formatCompactNumber(project.candidate.sold_count)}`
      : "销量待核对",
    project.candidate.commission_rate !== undefined
      ? `佣金 ${project.candidate.commission_rate}%`
      : "佣金待核对",
  ];
  context.save();
  context.globalAlpha = intro;
  facts.forEach((fact, index) => {
    const y = 955 + index * 58 + (1 - intro) * 40;
    context.fillStyle = index === 1 ? "#fff3df" : "#ffd166";
    roundRect(context, 46, y, 330 + index * 22, 42, 2);
    context.fill();
    context.fillStyle = "#18110d";
    context.font =
      '700 23px "Consolas", "Microsoft YaHei", monospace';
    context.fillText(fact, 62, y + 29);
  });
  context.restore();
}

function drawProductStrip(
  context: CanvasRenderingContext2D,
  productName: string,
  intro: number,
): void {
  context.save();
  context.globalAlpha = intro;
  context.translate(0, (1 - intro) * 58);
  context.fillStyle = "#fff3df";
  roundRect(context, 38, 1130, 644, 86, 2);
  context.fill();
  context.fillStyle = "#18110d";
  context.font =
    '800 27px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif';
  drawWrappedText(context, productName, 58, 1164, 600, 34, 2);
  context.restore();
}

function drawProgressAndTimer(
  context: CanvasRenderingContext2D,
  progress: number,
  second: number,
): void {
  context.fillStyle = "rgba(255,243,223,.24)";
  context.fillRect(42, 1246, 636, 5);
  context.fillStyle = "#ec6f3f";
  context.fillRect(42, 1246, 636 * progress, 5);
  context.fillStyle = "#9c8272";
  context.font =
    '600 18px "Consolas", "Microsoft YaHei", monospace';
  context.fillText(
    `${String(Math.min(15, Math.floor(second) + 1)).padStart(2, "0")} / 15`,
    560,
    69,
  );
  context.fillStyle = "#9c8272";
  context.font =
    '400 18px "KaiTi", "Microsoft YaHei", sans-serif';
  context.fillText("商品事实以发布页实时核对为准", 42, 1274);
}

function drawTransition(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  amount: number,
): void {
  if (amount <= 0) {
    return;
  }
  const eased = easeInOutCubic(amount);
  const colors = ["#ff5a2e", "#ffd166", "#fff3df", "#3a2017"];
  colors.forEach((color, index) => {
    const height = canvas.height * eased - index * 80;
    if (height <= 0) {
      return;
    }
    context.fillStyle = color;
    context.fillRect(index * 180, 0, 180, height);
  });
}

function transitionAmount(
  second: number,
  scenes: CanvasStoryScene[],
): number {
  for (const scene of scenes.slice(1)) {
    const distance = Math.abs(second - scene.start_second);
    if (distance < 0.32) {
      return 1 - distance / 0.32;
    }
  }
  return 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - (-2 * value + 2) ** 3 / 2;
}

function formatCompactNumber(value: number): string {
  if (value >= 10_000) {
    return `${Number((value / 10_000).toFixed(1))}万`;
  }
  return String(value);
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
): void {
  const scale = Math.max(width / image.width, height / image.height) * zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maximumWidth: number,
  lineHeight: number,
  maximumLines: number,
): number {
  const characters = [...value];
  const lines: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = `${current}${character}`;
    if (
      current &&
      context.measureText(candidate).width > maximumWidth
    ) {
      lines.push(current);
      current = character;
      if (lines.length === maximumLines - 1) {
        break;
      }
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maximumLines) {
    lines.push(current);
  }
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
  return y + (lines.length - 1) * lineHeight;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}
