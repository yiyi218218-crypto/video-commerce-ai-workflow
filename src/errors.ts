import type { ZodIssue } from "zod";

export interface SerializedError {
  code: string;
  message: string;
  details?: unknown;
}

export class VcaError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class AgentNotFoundError extends VcaError {
  constructor(agentName: string) {
    super("AGENT_NOT_FOUND", `Agent "${agentName}" is not registered.`);
  }
}

export class AgentInputValidationError extends VcaError {
  constructor(agentName: string, issues: ZodIssue[]) {
    super(
      "AGENT_INPUT_INVALID",
      `Input for agent "${agentName}" failed schema validation.`,
      issues,
    );
  }
}

export class AgentOutputValidationError extends VcaError {
  constructor(agentName: string, issues: ZodIssue[]) {
    super(
      "AGENT_OUTPUT_INVALID",
      `Output from agent "${agentName}" failed schema validation.`,
      issues,
    );
  }
}

export class AgentContractConsistencyError extends VcaError {
  constructor(agentName: string, message: string, details?: unknown) {
    super(
      "AGENT_CONTRACT_INCONSISTENT",
      `Agent "${agentName}" contract consistency check failed: ${message}`,
      details,
    );
  }
}

export class DuplicateAgentError extends VcaError {
  constructor(agentName: string) {
    super("AGENT_DUPLICATE", `Agent "${agentName}" is already registered.`);
  }
}

export class WorkflowConfigError extends VcaError {
  constructor(message: string, details?: unknown, options?: ErrorOptions) {
    super("WORKFLOW_CONFIG_INVALID", message, details, options);
  }
}

export class WorkflowStateError extends VcaError {
  constructor(message: string, details?: unknown) {
    super("WORKFLOW_STATE_INVALID", message, details);
  }
}

export class WorkflowInputMappingError extends VcaError {
  constructor(path: string) {
    super(
      "WORKFLOW_INPUT_MAPPING_FAILED",
      `Workflow input reference "${path}" could not be resolved.`,
    );
  }
}

export class RunNotFoundError extends VcaError {
  constructor(runId: string) {
    super("RUN_NOT_FOUND", `Workflow run "${runId}" was not found.`);
  }
}

export class RetryableAgentError extends VcaError {
  constructor(message: string, details?: unknown, options?: ErrorOptions) {
    super("AGENT_RETRYABLE_ERROR", message, details, options);
  }
}

export class LlmProviderRequestError extends VcaError {
  constructor(message: string, details?: unknown, options?: ErrorOptions) {
    super("LLM_PROVIDER_REQUEST_FAILED", message, details, options);
  }
}

export class CodexUsageLimitError extends VcaError {
  constructor(providerMessage: string) {
    const retryAt = /try again at (.+?)(?:\.|$)/i.exec(
      providerMessage,
    )?.[1];
    super(
      "CODEX_USAGE_LIMIT_REACHED",
      retryAt
        ? `本机 Codex 使用额度已用完，可在 ${retryAt} 后重试。`
        : "本机 Codex 使用额度已用完，请恢复额度后重试。",
    );
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof VcaError) {
    const serialized: SerializedError = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      serialized.details = error.details;
    }
    return serialized;
  }

  if (error instanceof Error) {
    return {
      code: "UNEXPECTED_ERROR",
      message: error.message,
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    message: String(error),
  };
}
