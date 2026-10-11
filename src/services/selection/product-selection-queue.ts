import { serializeError, VcaError } from "../../errors.js";
import {
  selectionAnalysisProfileSchema,
  type ProductSelectionAgentInput,
  type ProductSelectionAgentOutput,
  type SelectionAnalysisProfile,
  type SelectionBatch,
} from "../../schemas/product-selection.schema.js";
import { FileSelectionBatchStore } from "./file-selection-batch-store.js";

export type ProductSelectionExecutor = (
  input: ProductSelectionAgentInput,
) => Promise<ProductSelectionAgentOutput>;

export class ProductSelectionQueue {
  private readonly pending: string[] = [];
  private draining = false;

  constructor(
    private readonly store: FileSelectionBatchStore,
    private readonly executor: ProductSelectionExecutor,
  ) {}

  async initialize(): Promise<number> {
    return this.store.markInterrupted();
  }

  async submit(
    batchId: string,
    rawProfile: SelectionAnalysisProfile,
  ): Promise<SelectionBatch> {
    const profile = selectionAnalysisProfileSchema.parse(rawProfile);
    const batch = await this.store.get(batchId);
    if (batch.status === "queued" || batch.status === "analyzing") {
      throw new VcaError(
        "SELECTION_ANALYSIS_ALREADY_RUNNING",
        "This selection batch is already being analyzed.",
      );
    }
    const queued: SelectionBatch = {
      id: batch.id,
      status: "queued",
      source_page_url: batch.source_page_url,
      captured_at: batch.captured_at,
      candidates: batch.candidates,
      analysis_profile: profile,
      created_at: batch.created_at,
      updated_at: new Date().toISOString(),
    };
    await this.store.save(queued);
    this.pending.push(batchId);
    void this.drain();
    return queued;
  }

  async get(batchId: string): Promise<SelectionBatch> {
    return this.store.get(batchId);
  }

  async list(): Promise<SelectionBatch[]> {
    return this.store.list();
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      let batchId = this.pending.shift();
      while (batchId) {
        await this.execute(batchId);
        batchId = this.pending.shift();
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(batchId: string): Promise<void> {
    const queued = await this.store.get(batchId);
    const analysisProfile = queued.analysis_profile;
    if (!analysisProfile) {
      throw new VcaError(
        "SELECTION_ANALYSIS_PROFILE_MISSING",
        "Queued selection batch does not contain an analysis profile.",
      );
    }
    const analyzing: SelectionBatch = {
      ...queued,
      status: "analyzing",
      updated_at: new Date().toISOString(),
    };
    await this.store.save(analyzing);

    try {
      const analysis = await this.executor({
        profile: analysisProfile,
        candidates: analyzing.candidates,
      });
      const now = new Date().toISOString();
      await this.store.save({
        ...analyzing,
        status: "analyzed",
        analysis,
        updated_at: now,
        completed_at: now,
      });
    } catch (error) {
      const serialized = serializeError(error);
      const now = new Date().toISOString();
      await this.store.save({
        ...analyzing,
        status: "failed",
        error: {
          code: serialized.code,
          message: serialized.message,
        },
        updated_at: now,
        completed_at: now,
      });
    }
  }
}
