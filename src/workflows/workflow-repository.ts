import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { WorkflowConfigError } from "../errors.js";
import {
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from "../schemas/workflow-definition.schema.js";

export interface LoadedWorkflow {
  definition: WorkflowDefinition;
  hash: string;
  source: string;
}

const workflowNamePattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export class WorkflowRepository {
  constructor(private readonly directory: string) {}

  async load(workflowName: string): Promise<LoadedWorkflow> {
    if (!workflowNamePattern.test(workflowName)) {
      throw new WorkflowConfigError(
        `Workflow name "${workflowName}" is not a safe identifier.`,
      );
    }

    const source = path.join(this.directory, `${workflowName}.json`);
    let raw: string;
    try {
      raw = await readFile(source, "utf8");
    } catch (error) {
      throw new WorkflowConfigError(
        `Unable to read workflow "${workflowName}" from ${source}.`,
        undefined,
        { cause: error },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      throw new WorkflowConfigError(
        `Workflow "${workflowName}" is not valid JSON.`,
        undefined,
        { cause: error },
      );
    }

    const parsed = workflowDefinitionSchema.safeParse(json);
    if (!parsed.success) {
      throw new WorkflowConfigError(
        `Workflow "${workflowName}" failed schema validation.`,
        parsed.error.issues,
      );
    }
    if (parsed.data.workflow !== workflowName) {
      throw new WorkflowConfigError(
        `Workflow file "${workflowName}.json" declares workflow "${parsed.data.workflow}".`,
      );
    }

    return {
      definition: parsed.data,
      hash: createHash("sha256").update(raw).digest("hex"),
      source,
    };
  }

  async list(): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      throw new WorkflowConfigError(
        `Unable to list workflows in ${this.directory}.`,
        undefined,
        { cause: error },
      );
    }

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5))
      .sort();
  }
}
