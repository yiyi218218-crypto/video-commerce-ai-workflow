import { describe, expect, it, vi } from "vitest";

import type { ProductVideoProject } from "../../src/schemas/product-video-project.schema.js";
import {
  analyzeSelectionBatch,
  listSelectionBatches,
  waitForSelectionAnalysis,
} from "../../src/web/product-selection-api-client.js";
import {
  autoCreateProductVideos,
  openProductVideoProjectDirectory,
  renderProductVideoProject,
  submitProductVideoProduction,
  uploadRenderedProductVideo,
  waitForProductVideoProduction,
} from "../../src/web/product-video-api-client.js";
import {
  analyzedSelectionBatch,
  selectionInput,
} from "../fixtures/product-selection.js";

const preparedVideoProject: ProductVideoProject = {
  id: "ee5df42d-cf49-48dc-a05c-a1b9f9a06714",
  status: "prepared",
  batch_id: analyzedSelectionBatch.id,
  candidate: analyzedSelectionBatch.candidates[0]!,
  recommendation: analyzedSelectionBatch.analysis!.ranking[0]!,
  created_at: "2026-07-23T09:02:00.000Z",
  updated_at: "2026-07-23T09:02:00.000Z",
  directory_path: "C:\\video-project",
  assets: {
    image: {
      relative_path: "product-image.svg",
      media_type: "image/svg+xml",
    },
    narration: {
      relative_path: "narration.wav",
      media_type: "audio/wav",
    },
  },
  warnings: [],
  files: [
    "01-选品报告.json",
    "02-视频文案.txt",
    "03-带货关联清单.md",
    "manifest.json",
  ],
};

describe("product selection API clients", () => {
  it("lists batches and submits a Codex analysis profile", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          batches: [analyzedSelectionBatch],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(202, {
          ok: true,
          batch: {
            ...analyzedSelectionBatch,
            status: "queued",
            analysis: undefined,
            completed_at: undefined,
          },
        }),
      );

    await expect(listSelectionBatches(fetchMock)).resolves.toHaveLength(
      1,
    );
    await expect(
      analyzeSelectionBatch(
        analyzedSelectionBatch.id,
        selectionInput.profile,
        fetchMock,
      ),
    ).resolves.toMatchObject({ status: "queued" });
  });

  it("polls an async selection batch until Codex completes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          batch: {
            ...analyzedSelectionBatch,
            status: "analyzing",
            analysis: undefined,
            completed_at: undefined,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          batch: analyzedSelectionBatch,
        }),
      );

    const result = await waitForSelectionAnalysis(
      analyzedSelectionBatch.id,
      {
        fetchImplementation: fetchMock,
        pollIntervalMs: 1,
        timeoutMs: 1_000,
      },
    );

    expect(result.status).toBe("analyzed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("product video API client", () => {
  it("submits, polls, uploads, and opens an automatic video project", async () => {
    const completedProject: ProductVideoProject = {
      ...preparedVideoProject,
      status: "video_ready",
      rendered_video: {
        relative_path: "04-自动成片.webm",
        media_type: "video/webm",
        size_bytes: 8,
      },
      files: [...preparedVideoProject.files, "04-自动成片.webm"],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(202, {
          ok: true,
          job: {
            id: "de5df42d-cf49-48dc-a05c-a1b9f9a06714",
            status: "queued",
            request: {
              batch_id: analyzedSelectionBatch.id,
              candidate_id: analyzedSelectionBatch.analysis!.top_pick_id,
            },
            created_at: "2026-07-23T09:02:00.000Z",
            updated_at: "2026-07-23T09:02:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          job: {
            id: "de5df42d-cf49-48dc-a05c-a1b9f9a06714",
            status: "completed",
            request: {
              batch_id: analyzedSelectionBatch.id,
              candidate_id: analyzedSelectionBatch.analysis!.top_pick_id,
            },
            project: preparedVideoProject,
            created_at: "2026-07-23T09:02:00.000Z",
            updated_at: "2026-07-23T09:03:00.000Z",
            started_at: "2026-07-23T09:02:01.000Z",
            completed_at: "2026-07-23T09:03:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, project: completedProject }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const job = await submitProductVideoProduction(
      {
        batch_id: analyzedSelectionBatch.id,
        candidate_id: analyzedSelectionBatch.analysis!.top_pick_id,
      },
      fetchMock,
    );
    const prepared = await waitForProductVideoProduction(job.id, {
      fetchImplementation: fetchMock,
      pollIntervalMs: 1,
      timeoutMs: 1_000,
    });
    const video = new Blob(
      [
        new Uint8Array([
          0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01,
        ]),
      ],
      { type: "video/webm" },
    );
    const completed = await uploadRenderedProductVideo(
      prepared.id,
      video,
      fetchMock,
    );
    await openProductVideoProjectDirectory(prepared.id, fetchMock);

    expect(completed.status).toBe("video_ready");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/rendered"),
      expect.objectContaining({ method: "PUT", body: video }),
    );
  });

  it("requests automatic Top product MP4 projects", async () => {
    const completedProject: ProductVideoProject = {
      ...preparedVideoProject,
      status: "video_ready",
      rendered_video: {
        relative_path: "04-鑷姩鎴愮墖.mp4",
        media_type: "video/mp4",
        size_bytes: 12,
      },
      files: [...preparedVideoProject.files, "04-鑷姩鎴愮墖.mp4"],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(201, {
        ok: true,
        projects: [completedProject],
        skipped: [],
      }),
    );

    const result = await autoCreateProductVideos(
      analyzedSelectionBatch.id,
      {
        maximum_projects: 3,
        minimum_score: 70,
        render: true,
        render_quality: "draft",
      },
      fetchMock,
    );

    expect(result.projects[0]?.rendered_video?.media_type).toBe(
      "video/mp4",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auto-videos"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders an individual project through the local HyperFrames service", async () => {
    const completedProject: ProductVideoProject = {
      ...preparedVideoProject,
      status: "video_ready",
      rendered_video: {
        relative_path: "04-自动成片.mp4",
        media_type: "video/mp4",
        size_bytes: 12,
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(200, { ok: true, project: completedProject }),
    );

    await expect(
      renderProductVideoProject(preparedVideoProject.id, {
        render_quality: "standard",
      }, fetchMock),
    ).resolves.toMatchObject({ status: "video_ready" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/render"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
