import type {
  PromptDocument,
  PromptReference,
  PromptSource,
} from "./prompt-loader.js";

export interface InlinePrompt {
  id: string;
  version: string;
  content: string;
}

export class InlinePromptSource implements PromptSource {
  private readonly documents: ReadonlyMap<string, InlinePrompt>;
  private readonly cache = new Map<string, PromptDocument>();

  constructor(prompts: InlinePrompt[]) {
    this.documents = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  }

  async load(reference: PromptReference): Promise<PromptDocument> {
    const cached = this.cache.get(reference.id);
    if (cached) {
      return cached;
    }

    const prompt = this.documents.get(reference.id);
    if (!prompt || prompt.version !== reference.version) {
      throw new Error(
        `Inline prompt "${reference.id}" version "${reference.version}" is unavailable.`,
      );
    }

    const document = {
      ...prompt,
      sha256: await sha256(prompt.content),
    };
    this.cache.set(reference.id, document);
    return document;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
