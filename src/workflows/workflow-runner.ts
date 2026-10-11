import { AgentRegistry } from "../agents/agent-registry.js";
import {
  RetryableAgentError,
  WorkflowConfigError,
  WorkflowStateError,
  serializeError,
} from "../errors.js";
import {
  normalizeWorkflowSteps,
  type NormalizedWorkflowStep,
} from "../schemas/workflow-definition.schema.js";
import {
  workflowRunSchema,
  type WorkflowRun,
  type WorkflowRunStep,
} from "../schemas/workflow-run.schema.js";
import type { RunStore } from "../services/storage/run-store.js";
import { resolveInputTemplate } from "./input-mapper.js";
import type { LoadedWorkflow } from "./workflow-repository.js";

export class WorkflowRunner {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly runStore: RunStore,
  ) {}

  async start(
    loadedWorkflow: LoadedWorkflow,
    initialInput: unknown,
  ): Promise<WorkflowRun> {
    const normalizedSteps = this.normalize(loadedWorkflow);
    const now = new Date().toISOString();
    const run = workflowRunSchema.parse({
      id: globalThis.crypto.randomUUID(),
      workflow: loadedWorkflow.definition.workflow,
      workflowVersion: loadedWorkflow.definition.version,
      workflowHash: loadedWorkflow.hash,
      status: "pending",
      initialInput,
      artifacts: {},
      checkpoints: {},
      steps: normalizedSteps.map((step) => ({
        id: step.id,
        agent: step.agent,
        status: "pending",
        attempts: 0,
      })),
      createdAt: now,
      updatedAt: now,
    });

    await this.runStore.create(run);
    return this.execute(run, normalizedSteps);
  }

  async resume(
    runId: string,
    loadedWorkflow: LoadedWorkflow,
    checkpointInput?: unknown,
  ): Promise<WorkflowRun> {
    const run = await this.runStore.get(runId);
    this.assertWorkflowUnchanged(run, loadedWorkflow);
    const normalizedSteps = this.normalize(loadedWorkflow);

    if (run.status === "completed" || run.status === "cancelled") {
      throw new WorkflowStateError(
        `Workflow run "${run.id}" cannot be resumed from status "${run.status}".`,
      );
    }

    if (run.status === "waiting_for_input") {
      const checkpoint = run.pendingCheckpoint;
      if (!checkpoint) {
        throw new WorkflowStateError(
          `Workflow run "${run.id}" is waiting but has no pending checkpoint.`,
        );
      }
      this.applyCheckpointInput(
        run,
        normalizedSteps,
        checkpoint.stepId,
        checkpointInput ?? { approved: true },
      );
      delete run.pendingCheckpoint;
    } else if (run.status === "failed" && checkpointInput !== undefined) {
      const checkpointStep = [...normalizedSteps]
        .reverse()
        .find(
          (step) =>
            step.checkpoint &&
            Object.prototype.hasOwnProperty.call(run.checkpoints, step.id),
        );
      if (checkpointStep) {
        this.applyCheckpointInput(
          run,
          normalizedSteps,
          checkpointStep.id,
          checkpointInput,
        );
      }
    }

    for (const step of run.steps) {
      if (step.status === "failed" || step.status === "running") {
        this.resetStep(step);
      }
    }
    run.status = "pending";
    delete run.error;
    run.updatedAt = new Date().toISOString();
    await this.runStore.save(run);

    return this.execute(run, normalizedSteps);
  }

  private normalize(loadedWorkflow: LoadedWorkflow): NormalizedWorkflowStep[] {
    try {
      const steps = normalizeWorkflowSteps(loadedWorkflow.definition);
      const ids = new Set<string>();
      for (const step of steps) {
        if (ids.has(step.id)) {
          throw new WorkflowConfigError(
            `Workflow "${loadedWorkflow.definition.workflow}" contains duplicate step id "${step.id}".`,
          );
        }
        ids.add(step.id);
        this.registry.get(step.agent);
      }
      return steps;
    } catch (error) {
      if (error instanceof WorkflowConfigError) {
        throw error;
      }
      throw new WorkflowConfigError(
        `Workflow "${loadedWorkflow.definition.workflow}" could not be normalized.`,
        undefined,
        { cause: error },
      );
    }
  }

  private async execute(
    run: WorkflowRun,
    steps: NormalizedWorkflowStep[],
  ): Promise<WorkflowRun> {
    run.status = "running";
    run.updatedAt = new Date().toISOString();
    await this.runStore.save(run);

    for (let index = 0; index < steps.length; index += 1) {
      const stepDefinition = steps[index];
      if (!stepDefinition) {
        throw new WorkflowStateError(`Missing workflow step at index ${index}.`);
      }
      const stepRecord = run.steps[index];
      if (!stepRecord) {
        throw new WorkflowStateError(
          `Run "${run.id}" has no record for workflow step "${stepDefinition.id}".`,
        );
      }

      if (stepRecord.status === "completed") {
        const waiting = await this.pauseAtCheckpointIfNeeded(
          run,
          stepDefinition,
        );
        if (waiting) {
          return run;
        }
        continue;
      }

      const input = this.resolveStepInput(
        run,
        steps,
        index,
        stepDefinition,
      );
      stepRecord.input = input;
      stepRecord.status = "running";
      stepRecord.startedAt = new Date().toISOString();
      run.updatedAt = stepRecord.startedAt;
      await this.runStore.save(run);

      const completed = await this.executeStep(
        run,
        stepRecord,
        stepDefinition,
        input,
      );
      if (!completed) {
        return run;
      }

      const waiting = await this.pauseAtCheckpointIfNeeded(
        run,
        stepDefinition,
      );
      if (waiting) {
        return run;
      }
    }

    const completedAt = new Date().toISOString();
    run.status = "completed";
    run.completedAt = completedAt;
    run.updatedAt = completedAt;
    await this.runStore.save(run);
    return run;
  }

  private async executeStep(
    run: WorkflowRun,
    stepRecord: WorkflowRunStep,
    stepDefinition: NormalizedWorkflowStep,
    input: unknown,
  ): Promise<boolean> {
    const { maxAttempts, backoffMs } = stepDefinition.retry;

    while (stepRecord.attempts < maxAttempts) {
      stepRecord.attempts += 1;
      run.updatedAt = new Date().toISOString();
      await this.runStore.save(run);

      try {
        const execution = await this.registry.execute(
          stepDefinition.agent,
          input,
        );
        const completedAt = new Date().toISOString();
        stepRecord.output = execution.output;
        stepRecord.metadata = execution.metadata;
        stepRecord.status = "completed";
        stepRecord.completedAt = completedAt;
        delete stepRecord.error;
        run.artifacts[stepDefinition.id] = execution.output;
        run.updatedAt = completedAt;
        await this.runStore.save(run);
        return true;
      } catch (error) {
        const canRetry =
          error instanceof RetryableAgentError &&
          stepRecord.attempts < maxAttempts;
        if (canRetry) {
          const retryDelay = Math.min(
            backoffMs * 2 ** (stepRecord.attempts - 1),
            30_000,
          );
          await delay(retryDelay);
          continue;
        }

        const failedAt = new Date().toISOString();
        stepRecord.status = "failed";
        stepRecord.error = serializeError(error);
        stepRecord.completedAt = failedAt;
        run.status = "failed";
        run.error = serializeError(error);
        run.updatedAt = failedAt;
        await this.runStore.save(run);
        return false;
      }
    }

    throw new WorkflowStateError(
      `Step "${stepDefinition.id}" exhausted its attempts without a result.`,
    );
  }

  private resolveStepInput(
    run: WorkflowRun,
    steps: NormalizedWorkflowStep[],
    index: number,
    step: NormalizedWorkflowStep,
  ): unknown {
    if (step.input !== undefined) {
      return resolveInputTemplate(step.input, {
        input: run.initialInput,
        steps: run.artifacts,
        checkpoints: run.checkpoints,
      });
    }

    if (index === 0) {
      return run.initialInput;
    }

    const previousStep = steps[index - 1];
    if (!previousStep) {
      throw new WorkflowStateError(
        `Step "${step.id}" has no previous workflow step.`,
      );
    }
    return run.artifacts[previousStep.id];
  }

  private async pauseAtCheckpointIfNeeded(
    run: WorkflowRun,
    step: NormalizedWorkflowStep,
  ): Promise<boolean> {
    if (!step.checkpoint || step.id in run.checkpoints) {
      return false;
    }

    const now = new Date().toISOString();
    run.status = "waiting_for_input";
    run.pendingCheckpoint = {
      stepId: step.id,
      requestedAt: now,
    };
    run.updatedAt = now;
    await this.runStore.save(run);
    return true;
  }

  private assertWorkflowUnchanged(
    run: WorkflowRun,
    loadedWorkflow: LoadedWorkflow,
  ): void {
    if (
      run.workflow !== loadedWorkflow.definition.workflow ||
      run.workflowVersion !== loadedWorkflow.definition.version ||
      run.workflowHash !== loadedWorkflow.hash
    ) {
      throw new WorkflowStateError(
        `Workflow "${run.workflow}" changed after run "${run.id}" started. Restore the original definition or start a new run.`,
      );
    }
  }

  private applyCheckpointInput(
    run: WorkflowRun,
    steps: NormalizedWorkflowStep[],
    checkpointStepId: string,
    input: unknown,
  ): void {
    const checkpointIndex = steps.findIndex(
      (step) => step.id === checkpointStepId,
    );
    if (checkpointIndex < 0) {
      throw new WorkflowStateError(
        `Checkpoint step "${checkpointStepId}" is not present in workflow "${run.workflow}".`,
      );
    }

    run.checkpoints[checkpointStepId] = input;
    for (
      let index = checkpointIndex + 1;
      index < steps.length;
      index += 1
    ) {
      const stepDefinition = steps[index];
      const stepRecord = run.steps[index];
      if (!stepDefinition || !stepRecord) {
        throw new WorkflowStateError(
          `Run "${run.id}" is missing a downstream checkpoint step record.`,
        );
      }
      this.resetStep(stepRecord);
      delete run.artifacts[stepDefinition.id];
      delete run.checkpoints[stepDefinition.id];
    }
  }

  private resetStep(step: WorkflowRunStep): void {
    step.status = "pending";
    step.attempts = 0;
    delete step.input;
    delete step.output;
    delete step.metadata;
    delete step.error;
    delete step.startedAt;
    delete step.completedAt;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
