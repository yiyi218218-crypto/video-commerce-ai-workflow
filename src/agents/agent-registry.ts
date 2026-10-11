import {
  AgentInputValidationError,
  AgentNotFoundError,
  AgentOutputValidationError,
  DuplicateAgentError,
} from "../errors.js";
import type {
  AgentExecution,
  ContractAgent,
} from "./agent.js";

export class AgentRegistry {
  private readonly agents = new Map<string, ContractAgent>();

  register(agent: ContractAgent): void {
    if (this.agents.has(agent.name)) {
      throw new DuplicateAgentError(agent.name);
    }
    this.agents.set(agent.name, agent);
  }

  get(agentName: string): ContractAgent {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new AgentNotFoundError(agentName);
    }
    return agent;
  }

  list(): string[] {
    return [...this.agents.keys()].sort();
  }

  async execute(agentName: string, input: unknown): Promise<AgentExecution> {
    const agent = this.get(agentName);
    const parsedInput = agent.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new AgentInputValidationError(agentName, parsedInput.error.issues);
    }

    const output = await agent.run(parsedInput.data);
    const parsedOutput = agent.outputSchema.safeParse(output);
    if (!parsedOutput.success) {
      throw new AgentOutputValidationError(agentName, parsedOutput.error.issues);
    }

    const descriptor = agent.describe
      ? await agent.describe()
      : { name: agent.name };

    return {
      output: parsedOutput.data,
      metadata: {
        agent: descriptor.name,
        ...(descriptor.prompt ? { prompt: descriptor.prompt } : {}),
      },
    };
  }
}
