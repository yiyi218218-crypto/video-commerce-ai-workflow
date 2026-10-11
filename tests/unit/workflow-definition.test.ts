import { describe, expect, it } from "vitest";

import {
  normalizeWorkflowSteps,
  workflowDefinitionSchema,
} from "../../src/schemas/workflow-definition.schema.js";

describe("workflow definition", () => {
  it("supports the compact agent list syntax", () => {
    const workflow = workflowDefinitionSchema.parse({
      workflow: "video_sales",
      steps: ["product_agent", "content_agent", "content_agent"],
    });

    expect(normalizeWorkflowSteps(workflow)).toMatchObject([
      { id: "product_agent", agent: "product_agent" },
      { id: "content_agent", agent: "content_agent" },
      { id: "content_agent_2", agent: "content_agent" },
    ]);
  });

  it("rejects unknown workflow properties", () => {
    expect(() =>
      workflowDefinitionSchema.parse({
        workflow: "invalid",
        steps: ["agent"],
        executableCode: "doSomething()",
      }),
    ).toThrow();
  });
});
