import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface PromptReference {
  id: string;
  version: string;
  file: string | URL;
}

export interface PromptDocument {
  id: string;
  version: string;
  content: string;
  sha256: string;
}

export interface PromptSource {
  load(reference: PromptReference): Promise<PromptDocument>;
}

export class PromptLoader implements PromptSource {
  async load(reference: PromptReference): Promise<PromptDocument> {
    const content = await readFile(reference.file, "utf8");
    const sha256 = createHash("sha256").update(content).digest("hex");

    return {
      id: reference.id,
      version: reference.version,
      content,
      sha256,
    };
  }
}
