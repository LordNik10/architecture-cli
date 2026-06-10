import {
  AnthropicAnalyzer,
  assertApiKey,
  providerForModel,
  type ArchitectureAnalyzer,
} from "./client.js";
import { GeminiAnalyzer, assertGeminiApiKey } from "./gemini.js";
import { OpenAIAnalyzer, assertOpenAIApiKey } from "./openai.js";

/** Provider is inferred from the model id (see providerForModel). */
export function createAnalyzer(model: string): ArchitectureAnalyzer {
  switch (providerForModel(model)) {
    case "gemini":
      return new GeminiAnalyzer(model);
    case "openai":
      return new OpenAIAnalyzer(model);
    default:
      return new AnthropicAnalyzer(model);
  }
}

export function assertApiKeyForModel(model: string): void {
  switch (providerForModel(model)) {
    case "gemini":
      assertGeminiApiKey();
      break;
    case "openai":
      assertOpenAIApiKey();
      break;
    default:
      assertApiKey();
  }
}
