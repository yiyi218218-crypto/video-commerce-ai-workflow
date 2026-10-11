import { readFile } from "node:fs/promises";

import { VcaError } from "../../errors.js";
import {
  evaluationDatasetSchema,
  type EvaluationDataset,
} from "../../schemas/evaluation-dataset.schema.js";
import type { ProductCategory } from "../../schemas/product-agent.schema.js";

export interface DatasetSummary {
  total: number;
  categories: Record<ProductCategory, number>;
  uniqueIds: boolean;
}

export class DatasetService {
  async load(file: string): Promise<EvaluationDataset> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new VcaError(
        "EVALUATION_DATASET_READ_FAILED",
        `Unable to read evaluation dataset from ${file}.`,
        undefined,
        { cause: error },
      );
    }

    const parsed = evaluationDatasetSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new VcaError(
        "EVALUATION_DATASET_INVALID",
        `Evaluation dataset ${file} failed schema validation.`,
        parsed.error.issues,
      );
    }
    return parsed.data;
  }

  summarize(dataset: EvaluationDataset): DatasetSummary {
    const categories: Record<ProductCategory, number> = {
      food: 0,
      clothing: 0,
      jewelry: 0,
      beauty: 0,
      home: 0,
      maternal_baby: 0,
    };
    const ids = new Set<string>();

    for (const testCase of dataset) {
      categories[testCase.product.category] += 1;
      ids.add(testCase.id);
    }

    return {
      total: dataset.length,
      categories,
      uniqueIds: ids.size === dataset.length,
    };
  }
}
