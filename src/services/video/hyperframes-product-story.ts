import type { ProductVideoProject } from "../../schemas/product-video-project.schema.js";
import type { SelectionRecommendation } from "../../schemas/product-selection.schema.js";
import type { CreativeDirectorOutput } from "../../schemas/creative-production.schema.js";

export interface ProductVideoCreativeScene {
  start_second: number;
  end_second: number;
  beat: "contradiction" | "test" | "proof" | "invitation";
  kicker: string;
  headline: string;
  subline: string;
  motion: "overexpose" | "push" | "blocks" | "dip";
}

export interface ProductVideoCreativeBrief {
  format: "hyperframes_product_story";
  composition_id: "vca-product-story";
  duration_seconds: 15;
  visual_identity: {
    background: string;
    foreground: string;
    accent: string;
    secondary: string;
    muted: string;
  };
  anti_ad_rules: string[];
  scenes: ProductVideoCreativeScene[];
}

export function buildProductVideoCreativeBrief(
  recommendation: SelectionRecommendation,
): ProductVideoCreativeBrief {
  const plan = recommendation.video_plan;
  const cards = plan.cards;
  return {
    format: "hyperframes_product_story",
    composition_id: "vca-product-story",
    duration_seconds: 15,
    visual_identity: {
      background: "#18110d",
      foreground: "#fff3df",
      accent: "#ff5a2e",
      secondary: "#ffd166",
      muted: "#9c8272",
    },
    anti_ad_rules: [
      "先讲生活矛盾，再让商品出现。",
      "只使用可核对事实，不使用夸大承诺。",
      "成交引导用邀请式表达，不使用硬逼单。",
      "画面不得出现 AI 自动成片、爆单神器等自曝式话术。",
    ],
    scenes: [
      {
        start_second: 0,
        end_second: 3,
        beat: "contradiction",
        kicker: "先别买",
        headline: cleanLine(cards[0]?.headline ?? plan.hook, 18),
        subline: cleanLine(cards[0]?.subline ?? "这个问题先看清楚", 28),
        motion: "overexpose",
      },
      {
        start_second: 3,
        end_second: 7,
        beat: "test",
        kicker: "我试了一步",
        headline: cleanLine(cards[1]?.headline ?? "换个真实场景看", 18),
        subline: cleanLine(cards[1]?.subline ?? "商品只在动作里出现", 30),
        motion: "push",
      },
      {
        start_second: 7,
        end_second: 12,
        beat: "proof",
        kicker: "只看证据",
        headline: cleanLine(cards[2]?.headline ?? "这些信息发布前要核对", 18),
        subline: cleanLine(cards[2]?.subline ?? "价格、规格、库存都以页面为准", 32),
        motion: "blocks",
      },
      {
        start_second: 12,
        end_second: 15,
        beat: "invitation",
        kicker: "适合再点开",
        headline: cleanLine(cards[3]?.headline ?? plan.call_to_action, 18),
        subline: cleanLine(cards[3]?.subline ?? plan.call_to_action, 32),
        motion: "dip",
      },
    ],
  };
}

export function renderHyperframesDesign(): string {
  return [
    "# Product Story HyperFrames Design",
    "",
    "## Style Prompt",
    "",
    "Explosive social commerce story, not a direct-response ad. The video should feel like a creator noticed a real-life contradiction, tested one small object, and invited the viewer to check whether it fits their own scene. Use sharp editorial framing, kinetic Chinese typography, product close-ups, proof labels, and fast but readable scene changes.",
    "",
    "## Colors",
    "",
    "- Background: `#18110d`",
    "- Foreground: `#fff3df`",
    "- Accent: `#ff5a2e`",
    "- Secondary: `#ffd166`",
    "- Muted: `#9c8272`",
    "",
    "## Typography",
    "",
    "- Headline: `Arial Black`, `Microsoft YaHei UI`, sans-serif.",
    "- Body: `KaiTi`, `Microsoft YaHei`, sans-serif.",
    "- Numbers: `Consolas`, `Microsoft YaHei`, monospace.",
    "",
    "## What NOT to Do",
    "",
    "- No product-first opening.",
    "- No blue-purple AI gradients.",
    "- No hard-sell urgency or unverifiable claims.",
    "- No visible AI/platform self-labels in the rendered story.",
    "",
  ].join("\n");
}

export function renderHyperframesConfig(): string {
  return `${JSON.stringify(
    {
      compositions: [
        {
          id: "vca-product-story",
          file: "index.html",
          width: 1080,
          height: 1920,
          duration: 15,
        },
      ],
    },
    null,
    2,
  )}\n`;
}

export function renderHyperframesIndex(
  project: ProductVideoProject,
): string {
  if (project.creative_production) {
    return renderCreativeDirectorIndex(project, project.creative_production);
  }
  const brief =
    project.creative_brief ??
    buildProductVideoCreativeBrief(project.recommendation);
  const product = project.candidate;
  const price = product.price_amount ? `¥${product.price_amount}` : "价格待核对";
  const sold =
    product.sold_count !== undefined
      ? `${formatCompactNumber(product.sold_count)}人看过/买过`
      : "销量待核对";
  const commission =
    product.commission_rate !== undefined
      ? `${product.commission_rate}%佣金`
      : "佣金待核对";
  const imageSrc = `assets/${project.assets.image.relative_path}`;
  const narrationSrc = project.assets.narration
    ? `assets/${project.assets.narration.relative_path}`
    : null;
  const scenesHtml = brief.scenes
    .map(
      (scene, index) => `
        <section id="scene${index + 1}" class="scene ${scene.beat}">
          <div class="noise" data-layout-ignore></div>
          <div class="scene-content">
            <p class="kicker">${escapeHtml(scene.kicker)}</p>
            <h1>${escapeHtml(scene.headline)}</h1>
            <p class="subline">${escapeHtml(scene.subline)}</p>
            ${
              scene.beat === "proof"
                ? `<div class="proof-stack">
                    <span>${escapeHtml(price)}</span>
                    <span>${escapeHtml(sold)}</span>
                    <span>${escapeHtml(commission)}</span>
                  </div>`
                : ""
            }
          </div>
          <div class="product-strip">${escapeHtml(product.product_name)}</div>
        </section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Arial Black"; src: local("Arial Black"); }
      @font-face { font-family: "KaiTi"; src: local("KaiTi"); }
      @font-face { font-family: "Microsoft YaHei"; src: local("Microsoft YaHei"); }
      @font-face { font-family: "Microsoft YaHei UI"; src: local("Microsoft YaHei UI"); }
      @font-face { font-family: "Consolas"; src: local("Consolas"); }
      body {
        margin: 0;
        width: 720px;
        height: 1280px;
        overflow: hidden;
        background: #18110d;
        font-family: "KaiTi", "Microsoft YaHei", sans-serif;
      }
      #root {
        position: relative;
        width: 720px;
        height: 1280px;
        overflow: hidden;
        background: #18110d;
      }
      .scene {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background-color: rgba(24,17,13,0);
      }
      #scene1 { z-index: 3; }
      #scene2, #scene3, #scene4 { opacity: 0; z-index: 3; }
      .noise {
        position: absolute;
        inset: 0;
        opacity: .16;
        background-image:
          radial-gradient(circle at 16% 22%, rgba(255,90,46,.32), rgba(255,90,46,0) 26%),
          radial-gradient(circle at 82% 78%, rgba(255,209,102,.24), rgba(255,209,102,0) 28%),
          linear-gradient(100deg, rgba(255,243,223,.06) 0 1px, rgba(255,243,223,0) 1px 42px);
      }
      .scene-content {
        position: relative;
        z-index: 3;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        width: 100%;
        height: 100%;
        padding: 120px 44px 250px;
        gap: 18px;
        box-sizing: border-box;
      }
      .kicker {
        align-self: flex-start;
        margin: 0;
        padding: 10px 16px;
        border: 2px solid #ff5a2e;
        color: #ffd166;
        font: 600 30px "KaiTi", "Microsoft YaHei", sans-serif;
        transform: rotate(-2deg);
        background: #18110d;
      }
      h1 {
        align-self: flex-start;
        max-width: 600px;
        margin: 0;
        padding: 12px 16px 18px;
        background: #18110d;
        color: #fff3df;
        font: 900 84px/1.02 "Arial Black", "Microsoft YaHei UI", sans-serif;
        letter-spacing: 0;
        text-shadow: 8px 8px 0 #3a2017;
      }
      .subline {
        align-self: flex-start;
        max-width: 580px;
        margin: 0;
        padding: 10px 14px;
        background: #18110d;
        color: #fff3df;
        font: 400 34px/1.35 "KaiTi", "Microsoft YaHei", sans-serif;
      }
      .image-stage {
        position: absolute;
        top: 120px;
        right: -36px;
        z-index: 1;
        width: 420px;
        height: 560px;
        border: 8px solid #fff3df;
        box-shadow: -22px 22px 0 #ff5a2e;
        overflow: hidden;
        background: #2b1d15;
      }
      .image-stage img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scale(1.08);
      }
      .product-strip {
        position: absolute;
        left: 32px;
        right: 32px;
        bottom: 42px;
        z-index: 4;
        padding: 18px 22px;
        background: #fff3df;
        color: #18110d;
        font: 700 27px/1.25 "Microsoft YaHei", sans-serif;
      }
      .proof-stack {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        max-width: 580px;
      }
      .proof-stack span {
        padding: 11px 14px;
        background: #ffd166;
        color: #18110d;
        font: 700 24px "Consolas", "Microsoft YaHei", monospace;
        font-variant-numeric: tabular-nums;
      }
      .transition-block {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 20;
        width: 25%;
        background: #ff5a2e;
      }
      #block2 { left: 25%; background: #ffd166; }
      #block3 { left: 50%; background: #fff3df; }
      #block4 { left: 75%; background: #3a2017; }
      #block1 { left: 0; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="vca-product-story"
      data-width="720"
      data-height="1280"
      data-start="0"
      data-duration="15"
    >
      ${scenesHtml}
      <div id="productStage" class="image-stage" data-layout-allow-overflow>
        <img src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(product.product_name)}" crossorigin="anonymous" />
      </div>
      <div id="block1" class="transition-block" data-layout-ignore></div>
      <div id="block2" class="transition-block" data-layout-ignore></div>
      <div id="block3" class="transition-block" data-layout-ignore></div>
      <div id="block4" class="transition-block" data-layout-ignore></div>
      ${
        narrationSrc
          ? `<audio id="narration" data-start="0" data-duration="15" data-track-index="5" src="${escapeAttribute(narrationSrc)}" data-volume="1"></audio>`
          : ""
      }
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      function enter(scene, at) {
        tl.from(scene + " .kicker", { y: 34, rotation: -9, opacity: 0, duration: .42, ease: "back.out(1.8)" }, at + .18);
        tl.from(scene + " h1", { x: -64, scale: .94, opacity: 0, duration: .52, ease: "expo.out" }, at + .34);
        tl.from(scene + " .subline", { y: 42, opacity: 0, duration: .48, ease: "power3.out" }, at + .58);
        tl.fromTo("#productStage", { x: 90, y: -40, rotation: 12, opacity: .2 }, { x: 0, y: 0, rotation: 5, opacity: 1, duration: .62, ease: "circ.out", immediateRender: false }, at + .22);
        tl.from(scene + " .product-strip", { y: 80, opacity: 0, duration: .38, ease: "power4.out" }, at + .78);
      }
      function transitionTo(previousScene, scene, at) {
        tl.fromTo(".transition-block", { yPercent: 110 }, { yPercent: 0, duration: .22, ease: "power4.inOut", stagger: .035, immediateRender: false }, at);
        tl.set(scene, { opacity: 1, zIndex: 3 }, at + .18);
        tl.to(".transition-block", { yPercent: -110, duration: .26, ease: "expo.inOut", stagger: .035 }, at + .24);
        tl.set(previousScene, { opacity: 0, zIndex: 1 }, at + .58);
      }
      tl.set(".transition-block", { yPercent: 110 }, 0);
      enter("#scene1", 0);
      transitionTo("#scene1", "#scene2", 2.82);
      enter("#scene2", 3);
      transitionTo("#scene2", "#scene3", 6.76);
      enter("#scene3", 7);
      transitionTo("#scene3", "#scene4", 11.78);
      enter("#scene4", 12);
      tl.to("#root", { backgroundColor: "#0d0907", duration: .65, ease: "sine.inOut" }, 14.25);
      window.__timelines["vca-product-story"] = tl;
    </script>
  </body>
</html>
`;
}

function renderCreativeDirectorIndex(
  project: ProductVideoProject,
  production: CreativeDirectorOutput,
): string {
  const visualAssets =
    project.assets.gallery && project.assets.gallery.length > 0
      ? project.assets.gallery
      : [project.assets.image];
  const narrationSrc = project.assets.narration
    ? `assets/${project.assets.narration.relative_path}`
    : null;
  const bgmSrc = project.assets.bgm
    ? `assets/${project.assets.bgm.relative_path}`
    : null;
  const beats = production.beats;
  let nextVisualAsset = 0;
  const beatHtml = beats
    .map((beat, index) => {
      const hasProduct = beat.product_visibility !== "none";
      const position = ["no-product", "right", "center", "left", "right"][
        index
      ];
      const visualAsset = visualAssets[
        Math.min(nextVisualAsset, visualAssets.length - 1)
      ];
      if (hasProduct) {
        nextVisualAsset += 1;
      }
      const imageSrc = visualAsset
        ? `assets/${visualAsset.relative_path}`
        : null;
      return `<section id="director-scene-${index}" class="clip director-scene scene-${index} ${position}"
        data-start="${beat.start_second}" data-duration="${beat.end_second - beat.start_second}" data-track-index="1">
        <div class="scene-grid" data-layout-ignore></div>
        <div class="scene-orbit orbit-${index}" data-layout-ignore></div>
        <div class="scene-ghost" data-layout-ignore>${escapeHtml(beat.viewer_emotion)}</div>
        <div class="scene-slice slice-${index}" data-layout-ignore></div>
        <div class="scene-copy">
          <span class="scene-index">0${index + 1} / 05</span>
          <p class="scene-role">${escapeHtml(beat.viewer_emotion)}</p>
          <h1>${escapeHtml(beat.on_screen_text)}</h1>
          <p class="scene-action">${escapeHtml(beat.action)}</p>
        </div>
        ${
          hasProduct && imageSrc
            ? `<figure class="product-frame" data-layout-allow-overflow>
                <div class="product-matte"></div>
                <img class="shot-${beat.shot_type}" src="${escapeAttribute(imageSrc)}" alt="${escapeAttribute(production.display_name)}" />
                <figcaption>${escapeHtml(production.display_name)}</figcaption>
              </figure>`
            : `<div class="problem-object" data-layout-ignore><i></i><i></i><i></i></div>`
        }
      </section>`;
    })
    .join("\n");
  const captionHtml = production.captions
    .map(
      (caption, index) => `<div id="caption-${index}" class="clip caption ${caption.emphasis}"
        data-start="${caption.start_second}" data-duration="${caption.end_second - caption.start_second}" data-track-index="4">
        <span>${escapeHtml(caption.text)}</span>
      </div>`,
    )
    .join("\n");
  const sceneAnimations = beats
    .map((beat, index) => {
      const start = beat.start_second;
      const product = beat.product_visibility === "none"
        ? ""
        : `tl.from("#director-scene-${index} .product-frame", { x: ${index % 2 ? 130 : -130}, y: 42, rotation: ${index % 2 ? 5 : -5}, scale: .9, opacity: 0, duration: .72, ease: "expo.out" }, ${start + 0.26});`;
      return `tl.from("#director-scene-${index} .scene-slice", { x: ${index % 2 ? 260 : -260}, rotation: ${index % 2 ? 21 : -31}, opacity: 0, duration: .52, ease: "power4.out" }, ${start + 0.04});
        tl.from("#director-scene-${index} .scene-ghost", { x: ${index % 2 ? 110 : -110}, y: 44, opacity: 0, duration: .72, ease: "power2.out" }, ${start + 0.08});
        tl.from("#director-scene-${index} .scene-index", { y: 28, opacity: 0, duration: .28, ease: "power2.out" }, ${start + 0.12});
        tl.from("#director-scene-${index} h1", { y: 82, rotation: ${index % 2 ? 1.5 : -1.5}, opacity: 0, duration: .58, ease: "power4.out" }, ${start + 0.28});
        tl.from("#director-scene-${index} .scene-action", { y: 22, opacity: 0, duration: .42, ease: "power2.out" }, ${start + 0.66});
        ${product}`;
    })
    .join("\n");
  const captionAnimations = production.captions
    .map(
      (caption, index) => `tl.from("#caption-${index} span", { y: 38, opacity: 0, duration: .32, ease: "power3.out" }, ${caption.start_second + 0.14});`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Microsoft YaHei"; src: local("Microsoft YaHei"); }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #f1ece2; }
      body { font-family: "Microsoft YaHei", sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
      .film-bg { position: absolute; inset: 0; background: #f1ece2; overflow: hidden; }
      .film-bg::before { content: ""; position: absolute; inset: 0; opacity: .8; background-image: linear-gradient(90deg, rgba(26, 51, 42, .08) 1px, rgba(26, 51, 42, 0) 1px), linear-gradient(rgba(26, 51, 42, .07) 1px, rgba(26, 51, 42, 0) 1px); background-size: 54px 54px; }
      .film-bg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 85% 12%, rgba(245, 136, 69, .38), rgba(245, 136, 69, 0) 21%), radial-gradient(circle at 6% 74%, rgba(33, 107, 89, .26), rgba(33, 107, 89, 0) 24%); }
      .director-scene { position: absolute; inset: 0; color: #17362f; overflow: hidden; }
      .scene-grid { position: absolute; inset: 72px; border: 3px solid rgba(23, 54, 47, .24); }
      .scene-orbit { position: absolute; width: 560px; height: 560px; border: 8px solid rgba(245, 136, 69, .38); border-radius: 50%; right: -250px; top: 160px; }
      .orbit-1, .orbit-3 { left: -320px; right: auto; top: 300px; border-color: rgba(33, 107, 89, .3); }
      .scene-ghost { position: absolute; z-index: 0; right: -58px; bottom: 190px; width: 880px; color: rgba(23, 54, 47, .07); font-size: 156px; font-weight: 900; line-height: .95; letter-spacing: -.08em; text-align: right; text-transform: uppercase; overflow-wrap: anywhere; }
      .scene-slice { position: absolute; z-index: 1; width: 480px; height: 210px; background: #f58845; transform: rotate(-17deg); }
      .slice-0 { right: -180px; bottom: 170px; } .slice-1 { left: -250px; top: 240px; background: #216b59; } .slice-2 { right: -240px; top: 390px; background: #ffd166; } .slice-3 { left: -240px; bottom: 310px; background: #17362f; } .slice-4 { right: -220px; top: 220px; background: #d85e2c; }
      .scene-copy { position: absolute; z-index: 3; top: 170px; left: 88px; width: 660px; }
      .scene-index { display: inline-block; padding: 13px 18px; border: 3px solid #17362f; font: 700 23px/1 "Space Mono", monospace; letter-spacing: .06em; }
      .scene-role { margin: 80px 0 18px; color: #d85e2c; font-size: 30px; font-weight: 700; letter-spacing: .16em; }
      h1 { max-width: 640px; margin: 0; color: #17362f; font-size: 118px; line-height: 1.05; letter-spacing: -.06em; font-weight: 900; overflow-wrap: anywhere; text-wrap: balance; }
      .scene-action { max-width: 500px; margin: 36px 0 0; padding-top: 22px; border-top: 3px solid #17362f; color: #35594d; font-size: 31px; line-height: 1.45; font-weight: 500; }
      .product-frame { position: absolute; z-index: 4; width: 510px; height: 710px; margin: 0; overflow: hidden; background: #fffdf8; border: 12px solid #fffdf8; box-shadow: 26px 30px 0 #f58845; }
      .product-matte { position: absolute; z-index: 0; inset: 18px -120px -22px 64px; background: #ffd166; transform: rotate(-7deg); }
      .product-frame img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; }
      .product-frame img.shot-detail { transform: scale(1.28); object-position: 50% 34%; } .product-frame img.shot-close_up { transform: scale(1.18); object-position: 50% 50%; } .product-frame img.shot-overhead { transform: scale(1.05); object-position: 50% 20%; } .product-frame img.shot-pov { transform: scale(1.16); object-position: 70% 50%; } .product-frame img.shot-wide { transform: scale(1); object-position: 50% 50%; } .product-frame img.shot-graphic { transform: scale(1.12); object-position: 30% 50%; }
      .product-frame figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 16px 22px; background: rgba(23,54,47,.94); color: #fffdf8; font-size: 25px; font-weight: 700; }
      .right .product-frame { right: -70px; top: 800px; transform: rotate(5deg); }
      .left .product-frame { left: -70px; top: 800px; transform: rotate(-5deg); box-shadow: -26px 30px 0 #f58845; }
      .center .product-frame { left: 285px; top: 790px; width: 560px; height: 760px; transform: rotate(-2deg); }
      .no-product .problem-object { position: absolute; z-index: 2; right: 130px; bottom: 420px; width: 480px; height: 310px; border: 8px solid #17362f; transform: rotate(-9deg); }
      .problem-object i { position: absolute; width: 146px; height: 70px; border: 8px solid #f58845; transform: rotate(18deg); }
      .problem-object i:nth-child(1) { left: 34px; top: 48px; } .problem-object i:nth-child(2) { right: 40px; bottom: 48px; border-color: #216b59; } .problem-object i:nth-child(3) { left: 178px; bottom: 82px; border-color: #17362f; }
      .caption { position: absolute; z-index: 8; left: 88px; right: 88px; bottom: 220px; text-align: center; }
      .caption span { display: inline-block; max-width: 800px; padding: 18px 30px; background: #17362f; color: #fffdf8; font-size: 62px; font-weight: 900; line-height: 1.25; box-shadow: 12px 12px 0 #f58845; }
      .caption.key_word span { background: #216b59; } .caption.punchline span { background: #d85e2c; }
      .safe-note { position: absolute; z-index: 9; left: 88px; bottom: 90px; color: #35594d; font: 500 20px/1.2 "Space Mono", monospace; letter-spacing: .04em; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="vca-product-story" data-width="1080" data-height="1920" data-start="0" data-duration="15">
      <div class="film-bg"><div id="ambient-orb" data-layout-ignore></div></div>
      ${beatHtml}
      ${captionHtml}
      <div class="safe-note">STORY FIRST · FACTS VERIFIED BEFORE PUBLISH</div>
      ${narrationSrc ? `<audio id="director-narration" data-start="0" data-duration="15" data-track-index="7" src="${escapeAttribute(narrationSrc)}" data-volume="1"></audio>` : ""}
      ${bgmSrc ? `<audio id="director-bgm" data-start="0" data-duration="15" data-track-index="6" src="${escapeAttribute(bgmSrc)}" data-volume="0.16"></audio>` : ""}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      var tl = gsap.timeline({ paused: true });
      tl.to(".scene-orbit", { rotation: 24, scale: 1.08, duration: 15, ease: "sine.inOut", stagger: .08 }, 0);
      tl.to(".scene-slice", { x: 42, y: -22, rotation: 5, duration: 2.2, ease: "sine.inOut", stagger: .16 }, 0);
      ${sceneAnimations}
      ${captionAnimations}
      window.__timelines["vca-product-story"] = tl;
    </script>
  </body>
</html>`;
}

function cleanLine(value: string, maximumCharacters: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return [...normalized].slice(0, maximumCharacters).join("");
}

function formatCompactNumber(value: number): string {
  if (value >= 10_000) {
    return `${Number((value / 10_000).toFixed(1))}万`;
  }
  return String(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&'"]/gu, (character) => {
    const entities: Record<string, string> = {
      '"': "&quot;",
      "'": "&#39;",
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return entities[character] ?? character;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/gu, "&#96;");
}
