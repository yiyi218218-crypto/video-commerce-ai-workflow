import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { VcaError, WorkflowStateError } from "../../errors.js";
import {
  importSelectionCandidatesRequestSchema,
  selectionBatchSchema,
  type CaptureSelectionCandidateGalleryRequest,
  type ImportSelectionCandidatesRequest,
  type SelectionBatch,
} from "../../schemas/product-selection.schema.js";

const batchIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FileSelectionBatchStore {
  constructor(private readonly directory: string) {}

  async importCandidates(
    request: ImportSelectionCandidatesRequest,
  ): Promise<SelectionBatch> {
    const parsed = importSelectionCandidatesRequestSchema.parse(request);
    const now = new Date().toISOString();
    const batch: SelectionBatch = {
      id: randomUUID(),
      status: "imported",
      source_page_url: parsed.source_page_url,
      captured_at: parsed.captured_at,
      candidates: parsed.candidates,
      created_at: now,
      updated_at: now,
    };
    await this.write(batch);
    return batch;
  }

  async save(batch: SelectionBatch): Promise<void> {
    await this.write(batch);
  }

  async attachCandidateGallery(
    batchId: string,
    candidateId: string,
    request: CaptureSelectionCandidateGalleryRequest,
  ): Promise<SelectionBatch> {
    const batch = await this.get(batchId);
    if (batch.status === "analyzing") {
      throw new WorkflowStateError(
        "Cannot change a candidate's visual assets while selection analysis is running.",
      );
    }
    const requestedImageUrls = [...new Set(request.image_urls)];
    if (requestedImageUrls.length < 2) {
      throw new VcaError(
        "SELECTION_GALLERY_IMAGES_INSUFFICIENT",
        "At least two distinct visible detail-page images are required.",
      );
    }
    let found = false;
    const candidates = batch.candidates.map((candidate) => {
      if (candidate.candidate_id !== candidateId) {
        return candidate;
      }
      found = true;
      return {
        ...candidate,
        gallery_image_urls: [
          ...new Set([
            ...(candidate.gallery_image_urls ?? []),
            ...requestedImageUrls,
          ]),
        ].slice(0, 12),
      };
    });
    if (!found) {
      throw new VcaError(
        "SELECTION_CANDIDATE_NOT_FOUND",
        `Candidate "${candidateId}" is not present in selection batch "${batchId}".`,
      );
    }
    const updated: SelectionBatch = {
      ...batch,
      candidates,
      updated_at: new Date().toISOString(),
    };
    await this.write(updated);
    return updated;
  }

  async get(batchId: string): Promise<SelectionBatch> {
    const file = this.resolveBatchFile(batchId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        try {
          raw = await readFile(`${file}.bak`, "utf8");
        } catch (backupError) {
          if (
            isNodeError(backupError) &&
            backupError.code === "ENOENT"
          ) {
            throw new VcaError(
              "SELECTION_BATCH_NOT_FOUND",
              `Selection batch "${batchId}" was not found.`,
            );
          }
          throw backupError;
        }
      }
      else {
        throw error;
      }
    }
    try {
      return selectionBatchSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new WorkflowStateError(
        `Stored selection batch "${batchId}" is invalid.`,
        error,
      );
    }
  }

  async list(): Promise<SelectionBatch[]> {
    await mkdir(this.directory, { recursive: true });
    const files = await readdir(this.directory);
    const batchIds = [
      ...new Set(
        files.flatMap((file) => {
          const match = /^([0-9a-f-]+)\.json(?:\.bak)?$/i.exec(file);
          return match?.[1] ? [match[1]] : [];
        }),
      ),
    ];
    const batches = await Promise.all(
      batchIds.map((batchId) => this.get(batchId)),
    );
    return batches.sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );
  }

  async markInterrupted(): Promise<number> {
    const batches = await this.list();
    let count = 0;
    for (const batch of batches) {
      if (
        batch.status !== "queued" &&
        batch.status !== "analyzing"
      ) {
        continue;
      }
      const now = new Date().toISOString();
      const interrupted: SelectionBatch = {
        ...batch,
        status: "failed",
        error: {
          code: "SELECTION_ANALYSIS_INTERRUPTED",
          message:
            "本机服务在选品分析完成前停止，请重新提交这批候选。",
        },
        updated_at: now,
        completed_at: now,
      };
      await this.save(interrupted);
      count += 1;
    }
    return count;
  }

  private async write(batch: SelectionBatch): Promise<void> {
    const parsed = selectionBatchSchema.parse(batch);
    await mkdir(this.directory, { recursive: true });
    const file = this.resolveBatchFile(parsed.id);
    const backup = `${file}.bak`;
    const temporary = path.join(
      this.directory,
      `${parsed.id}.${randomUUID()}.tmp`,
    );
    await writeFile(
      temporary,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
    await unlinkIfExists(backup);
    let hasBackup = false;
    try {
      try {
        await rename(file, backup);
        hasBackup = true;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
          throw error;
        }
      }
      await rename(temporary, file);
      if (hasBackup) {
        await unlinkIfExists(backup);
      }
    } catch (error) {
      await unlinkIfExists(temporary);
      if (hasBackup) {
        try {
          await rename(backup, file);
        } catch {
          // The backup remains recoverable if restoration fails.
        }
      }
      throw error;
    }
  }

  private resolveBatchFile(batchId: string): string {
    if (!batchIdPattern.test(batchId)) {
      throw new VcaError(
        "SELECTION_BATCH_ID_INVALID",
        `Selection batch id "${batchId}" is not valid.`,
      );
    }
    return path.join(this.directory, `${batchId}.json`);
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
