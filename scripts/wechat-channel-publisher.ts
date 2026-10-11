import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium, type Frame, type Locator, type Page } from "playwright-core";

type Action = "inspect" | "prepare" | "publish";

interface PublisherJob {
  videoPath: string;
  shortTitle: string;
  description: string;
  expectedChannelName: string;
  aiGenerated: boolean;
  confirmPublish: boolean;
}

interface CliOptions {
  action: Action;
  endpoint: string;
  jobPath: string;
  outputDirectory: string;
}

const projectRoot = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const job = await loadJob(options.jobPath);
  await mkdir(options.outputDirectory, { recursive: true });

  const browser = await chromium.connectOverCDP(options.endpoint);
  {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("WECHAT_BROWSER_CONTEXT_MISSING");
    }
    let page = context
      .pages()
      .find((candidate) => candidate.url().includes("channels.weixin.qq.com"));
    page ??= await context.newPage();
    await page.bringToFront();

    if (!page.url().includes("channels.weixin.qq.com")) {
      await page.goto("https://channels.weixin.qq.com/platform/post/create", {
        waitUntil: "domcontentloaded",
      });
    }
    await page.waitForTimeout(1_000);

    if (isLoginPage(page)) {
      const report = await captureState(page, options, "login-required", {
        status: "login_required",
      });
      emit(report);
      process.exitCode = 2;
      return;
    }

    if (!page.url().includes("/platform/post/create")) {
      await page.goto("https://channels.weixin.qq.com/platform/post/create", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1_500);
    }

    if (options.action === "inspect") {
      emit(await captureState(page, options, "inspect", pageSignals(page)));
      return;
    }

    if (options.action === "prepare") {
      const account = await verifyChannelAccount(page, job.expectedChannelName);
      if (!account.verified) {
        throw new Error(
          `WECHAT_CHANNEL_NOT_VERIFIED: expected ${job.expectedChannelName}`,
        );
      }
      if (!existsSync(job.videoPath)) {
        throw new Error(`WECHAT_VIDEO_NOT_FOUND: ${job.videoPath}`);
      }
      const upload = (await hasExistingVideo(page))
        ? {
            inputFound: true,
            filename: path.basename(job.videoPath),
            method: "existing",
          }
        : await selectVideo(page, job.videoPath);
      const descriptionFilled = await fillFirst(
        page,
        [
          'textarea[placeholder*="描述"]',
          'textarea[placeholder*="内容"]',
          '[contenteditable="true"][data-placeholder*="描述"]',
          '[contenteditable="true"][aria-label*="描述"]',
          '[contenteditable][data-placeholder*="描述"]',
          '[contenteditable].input-editor',
          "textarea",
        ],
        job.description,
      );
      const titleFilled = await fillFirst(
        page,
        [
          'input[placeholder*="短标题"]',
          'input[placeholder*="标题"]',
          '[contenteditable="true"][data-placeholder*="标题"]',
          '[contenteditable="true"][aria-label*="标题"]',
        ],
        job.shortTitle,
      );
      const locationCleared = await clearLocation(page);
      const aiDisclosure = job.aiGenerated
        ? await enableAiDisclosure(page)
        : { found: false, checked: false };
      await page.waitForTimeout(5_000);
      emit(
        await captureState(page, options, "prepared", {
          status: "prepared",
          upload,
          descriptionFilled,
          titleFilled,
          locationCleared,
          account,
          aiDisclosure,
          ...(await pageSignals(page)),
        }),
      );
      return;
    }

    if (!job.confirmPublish) {
      throw new Error(
        "WECHAT_PUBLISH_NOT_CONFIRMED: set confirmPublish=true in the reviewed job file",
      );
    }
    const account = await verifyChannelAccount(page, job.expectedChannelName);
    if (!account.verified) {
      throw new Error(
        `WECHAT_CHANNEL_NOT_VERIFIED: expected ${job.expectedChannelName}`,
      );
    }
    const signals = await pageSignals(page);
    if (signals.uploadInProgress) {
      throw new Error("WECHAT_UPLOAD_NOT_READY");
    }
    if (signals.uploadFailed) {
      throw new Error("WECHAT_UPLOAD_FAILED");
    }
    const aiDisclosure = job.aiGenerated
      ? await enableAiDisclosure(page)
      : { found: false, checked: false };
    const locationCleared = await clearLocation(page);
    await captureState(page, options, "before-publish", {
      status: "ready_to_publish",
      account,
      aiDisclosure,
      locationCleared,
      ...signals,
    });

    const publishButton = await findPublishButton(page);
    if (!publishButton) {
      throw new Error("WECHAT_PUBLISH_BUTTON_NOT_FOUND");
    }
    await publishButton.click();
    await page.waitForTimeout(1_500);
    const confirmButton = await firstVisible([
      page.getByRole("button", { name: /^(确认发布|确认发表|确定发布)$/u }),
      page.locator('button:has-text("确认发布")'),
      page.locator('button:has-text("确认发表")'),
    ]);
    if (confirmButton) {
      await confirmButton.click();
    }
    await page.waitForTimeout(4_000);
    const afterSignals = await pageSignals(page);
    const submitted =
      page.url().includes("/platform/post/list") ||
      /发布成功|发表成功|已提交|审核中/u.test(afterSignals.bodyText);
    emit(
      await captureState(page, options, "after-publish", {
        status: submitted ? "submitted" : "submission_unconfirmed",
        ...afterSignals,
      }),
    );
    if (!submitted) {
      process.exitCode = 3;
    }
  }
}

function parseCli(args: string[]): CliOptions {
  const read = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const action = (read("--action") ?? "inspect") as Action;
  if (!(["inspect", "prepare", "publish"] as string[]).includes(action)) {
    throw new Error(`WECHAT_ACTION_INVALID: ${action}`);
  }
  const jobPath = path.resolve(
    read("--job") ??
      path.join(projectRoot, "data", "channel-publisher", "current-job.json"),
  );
  return {
    action,
    endpoint: read("--endpoint") ?? "http://127.0.0.1:9333",
    jobPath,
    outputDirectory: path.resolve(
      read("--output") ??
        path.join(projectRoot, "data", "channel-publisher", "state"),
    ),
  };
}

async function loadJob(jobPath: string): Promise<PublisherJob> {
  const raw = JSON.parse(await readFile(jobPath, "utf8")) as Partial<PublisherJob>;
  if (
    typeof raw.videoPath !== "string" ||
    typeof raw.shortTitle !== "string" ||
    typeof raw.description !== "string" ||
    typeof raw.expectedChannelName !== "string" ||
    typeof raw.aiGenerated !== "boolean" ||
    typeof raw.confirmPublish !== "boolean"
  ) {
    throw new Error("WECHAT_JOB_INVALID");
  }
  return {
    videoPath: path.resolve(raw.videoPath),
    shortTitle: raw.shortTitle.trim(),
    description: raw.description.trim(),
    expectedChannelName: raw.expectedChannelName.trim(),
    aiGenerated: raw.aiGenerated,
    confirmPublish: raw.confirmPublish,
  };
}

async function verifyChannelAccount(
  page: Page,
  expectedChannelName: string,
): Promise<{ expectedChannelName: string; verified: boolean }> {
  // The Channels form renders inside an iframe on some sessions, while the
  // account switcher can remain in the top document. Check both so a visible
  // logged-in account is not falsely rejected before upload.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const documents: Array<Page | Frame> = [page, ...page.frames()];
    for (const document of documents) {
      try {
        const matchingText = document.getByText(expectedChannelName, { exact: false });
        const count = Math.min(await matchingText.count(), 20);
        for (let index = 0; index < count; index += 1) {
          if (await matchingText.nth(index).isVisible().catch(() => false)) {
            return { expectedChannelName, verified: true };
          }
        }
      } catch {
        // A Channels iframe may be replaced while the form hydrates; skip the
        // detached frame and continue checking the current page/other frames.
      }
    }
    await page.waitForTimeout(500);
  }
  return { expectedChannelName, verified: false };
}

function isLoginPage(page: Page): boolean {
  return page.url().includes("/login");
}

async function selectVideo(
  page: Page,
  videoPath: string,
): Promise<{ inputFound: boolean; filename: string; method: string }> {
  let input = await firstVisibleOrAttachedInScopes(page, (scope) => [
    scope.locator('input[type="file"][accept*="video"]'),
    scope.locator('input[type="file"]'),
  ]);
  if (!input) {
    const uploadButton = await firstVisibleInScopes(page, (scope) => [
      scope.getByRole("button", { name: /上传视频|选择视频|发表视频/u }),
      scope.locator('[role="button"]:has-text("上传视频")'),
      scope.locator('button:has-text("上传")'),
    ]);
    if (uploadButton) {
      await uploadButton.click();
      await page.waitForTimeout(500);
      input = await firstVisibleOrAttachedInScopes(page, (scope) => [
        scope.locator('input[type="file"][accept*="video"]'),
        scope.locator('input[type="file"]'),
      ]);
    }
  }
  if (!input) {
    throw new Error("WECHAT_VIDEO_INPUT_NOT_FOUND");
  }
  const videoStats = await stat(videoPath);
  if (videoStats.size <= 50 * 1024 * 1024) {
    try {
      await input.setInputFiles(videoPath, { timeout: 10_000 });
      return {
        inputFound: true,
        filename: path.basename(videoPath),
        method: "playwright",
      };
    } catch {
      await setLargeFileInputViaCdp(page, videoPath);
      return {
        inputFound: true,
        filename: path.basename(videoPath),
        method: "playwright-fallback-cdp",
      };
    }
  }
  await setLargeFileInputViaCdp(page, videoPath);
  return {
    inputFound: true,
    filename: path.basename(videoPath),
    method: "local-cdp",
  };
}

async function hasExistingVideo(page: Page): Promise<boolean> {
  for (const scope of interactionScopes(page)) {
    const videos = scope.locator("video");
    const count = Math.min(await videos.count(), 20);
    for (let index = 0; index < count; index += 1) {
      if (await videos.nth(index).isVisible().catch(() => false)) {
        return true;
      }
    }
  }
  return false;
}

async function setLargeFileInputViaCdp(
  page: Page,
  videoPath: string,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("DOM.enable");
    const document = await session.send("DOM.getFlattenedDocument", {
      depth: -1,
      pierce: true,
    });
    const fileInput = document.nodes.find((node) => {
      if (node.nodeName !== "INPUT" || !node.backendNodeId) {
        return false;
      }
      const attributes = node.attributes ?? [];
      const attributeMap = new Map<string, string>();
      for (let index = 0; index < attributes.length; index += 2) {
        attributeMap.set(attributes[index] ?? "", attributes[index + 1] ?? "");
      }
      return (
        attributeMap.get("type") === "file" &&
        /video/u.test(attributeMap.get("accept") ?? "video")
      );
    });
    if (!fileInput?.backendNodeId) {
      throw new Error("WECHAT_VIDEO_CDP_INPUT_NOT_FOUND");
    }
    await session.send("DOM.setFileInputFiles", {
      files: [videoPath],
      backendNodeId: fileInput.backendNodeId,
    });
  } finally {
    await session.detach();
  }
}

async function fillFirst(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const scope of interactionScopes(page)) {
    for (const selector of selectors) {
      const locator = scope.locator(selector);
      const count = Math.min(await locator.count(), 10);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) {
          continue;
        }
        try {
          await candidate.fill(value);
          return true;
        } catch {
          await candidate.click();
          await candidate.evaluate((node, nextValue) => {
            const element = node as HTMLElement & { value?: string };
            if ("value" in element) {
              element.value = nextValue;
            } else {
              element.textContent = nextValue;
            }
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          }, value);
          return true;
        }
      }
    }
  }
  return false;
}

async function enableAiDisclosure(
  page: Page,
): Promise<{ found: boolean; checked: boolean }> {
  for (const scope of interactionScopes(page)) {
    const markTagSelect = scope.locator(".mark-tag-select").first();
    if ((await markTagSelect.count()) > 0) {
      const display = markTagSelect.locator(".select-display");
      if (await display.isVisible().catch(() => false)) {
        const selectedText = await display.textContent().catch(() => "");
        if (/含AI生成内容/u.test(selectedText ?? "")) {
          return { found: true, checked: true };
        }
        await display.click();
        const option = markTagSelect
          .locator(".mark-tag-option")
          .filter({ hasText: /^含AI生成内容$/u })
          .first();
        if (await option.isVisible().catch(() => false)) {
          await option.click();
          const updatedText = await display.textContent().catch(() => "");
          return {
            found: true,
            checked: /含AI生成内容/u.test(updatedText ?? ""),
          };
        }
      }
    }

    const namedCheckbox = scope.getByRole("checkbox", {
      name: /AI生成|人工智能生成|内容由AI生成|AIGC/u,
    });
    if ((await namedCheckbox.count()) > 0) {
      const checkbox = namedCheckbox.first();
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
      return { found: true, checked: await checkbox.isChecked() };
    }

    const labels = scope.locator("label").filter({
      hasText: /AI生成|人工智能生成|内容由AI生成|AIGC/u,
    });
    if ((await labels.count()) > 0) {
      const input = labels.first().locator('input[type="checkbox"]');
      if ((await input.count()) > 0) {
        if (!(await input.isChecked())) {
          await input.check();
        }
        return { found: true, checked: await input.isChecked() };
      }
      return { found: true, checked: false };
    }
  }
  return { found: false, checked: false };
}

async function clearLocation(
  page: Page,
): Promise<{ found: boolean; cleared: boolean }> {
  for (const scope of interactionScopes(page)) {
    const display = scope.locator(".position-display-wrap").first();
    if (!(await display.isVisible().catch(() => false))) {
      continue;
    }
    const currentText = await display.textContent().catch(() => "");
    if (/不显示位置/u.test(currentText ?? "")) {
      return { found: true, cleared: true };
    }
    await display.scrollIntoViewIfNeeded().catch(() => undefined);
    await display.click();
    await page.waitForTimeout(500);

    const option = await firstVisible([
      scope.getByText("不显示位置", { exact: true }),
      scope.locator('[role="option"]').filter({ hasText: /^不显示位置$/u }),
      scope.locator("li").filter({ hasText: /^不显示位置$/u }),
      scope.locator(".el-select-dropdown__item").filter({
        hasText: /^不显示位置$/u,
      }),
      scope.locator("div").filter({ hasText: /^不显示位置$/u }),
    ]);
    if (option) {
      await option.scrollIntoViewIfNeeded().catch(() => undefined);
      await option.click();
      await page.waitForTimeout(800);
    }

    const updatedText = await display.textContent().catch(() => "");
    return {
      found: true,
      cleared: /不显示位置/u.test(updatedText ?? ""),
    };
  }
  return { found: false, cleared: false };
}

async function findPublishButton(page: Page): Promise<Locator | null> {
  return firstVisibleInScopes(page, (scope) => [
    scope.getByRole("button", { name: /^(发表|发布|立即发表|立即发布)$/u }),
    scope.locator('button:has-text("发表")'),
    scope.locator('button:has-text("立即发布")'),
  ]);
}

async function firstVisible(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    const count = Math.min(await locator.count(), 20);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }
  return null;
}

type InteractionScope = Page | Frame;

function interactionScopes(page: Page): InteractionScope[] {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function firstVisibleInScopes(
  page: Page,
  createLocators: (scope: InteractionScope) => Locator[],
): Promise<Locator | null> {
  for (const scope of interactionScopes(page)) {
    const visible = await firstVisible(createLocators(scope));
    if (visible) {
      return visible;
    }
  }
  return null;
}

async function firstVisibleOrAttachedInScopes(
  page: Page,
  createLocators: (scope: InteractionScope) => Locator[],
): Promise<Locator | null> {
  const visible = await firstVisibleInScopes(page, createLocators);
  if (visible) {
    return visible;
  }
  for (const scope of interactionScopes(page)) {
    for (const locator of createLocators(scope)) {
      if ((await locator.count()) > 0) {
        return locator.first();
      }
    }
  }
  return null;
}

async function pageSignals(page: Page): Promise<{
  bodyText: string;
  uploadFailed: boolean;
  uploadInProgress: boolean;
}> {
  const bodyText = (
    await Promise.all(
      interactionScopes(page).map((scope) =>
        scope.locator("body").innerText().catch(() => ""),
      ),
    )
  )
    .join(" ")
    .replace(/\s+/gu, " ")
    .slice(0, 8_000);
  return {
    bodyText,
    uploadFailed: /上传失败|视频处理失败|格式不支持|重新上传/u.test(bodyText),
    uploadInProgress:
      /上传中|正在上传|视频处理中|正在处理/u.test(bodyText) ||
      /\b\d{1,3}%\b/u.test(bodyText),
  };
}

async function captureState(
  page: Page,
  options: CliOptions,
  label: string,
  extra: Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const screenshotPath = path.join(options.outputDirectory, `${label}.png`);
  const reportPath = path.join(options.outputDirectory, `${label}.json`);
  let screenshotCaptured = true;
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
      timeout: 12_000,
    });
  } catch {
    try {
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        timeout: 12_000,
      });
    } catch {
      screenshotCaptured = false;
    }
  }
  const controls = await page
    .locator('button,input,textarea,[contenteditable="true"],[role="button"]')
    .evaluateAll((nodes) =>
      nodes.slice(0, 250).map((node) => {
        const element = node as HTMLElement;
        const input = node as HTMLInputElement;
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || "").trim().slice(0, 160),
          type: input.type || "",
          placeholder: input.placeholder || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          accept: input.accept || "",
          disabled: input.disabled || element.getAttribute("aria-disabled") === "true",
        };
      }),
    );
  const report = {
    capturedAt: new Date().toISOString(),
    action: options.action,
    url: page.url(),
    title: await page.title(),
    screenshotPath,
    screenshotCaptured,
    controls,
    ...(await extra),
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

function emit(value: unknown): void {
  const report = value as Record<string, unknown>;
  const summary = {
    status: report.status ?? "inspected",
    url: report.url,
    title: report.title,
    screenshotPath: report.screenshotPath,
    account: report.account,
    upload: report.upload,
    descriptionFilled: report.descriptionFilled,
    titleFilled: report.titleFilled,
    locationCleared: report.locationCleared,
    aiDisclosure: report.aiDisclosure,
    uploadInProgress: report.uploadInProgress,
    uploadFailed: report.uploadFailed,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
