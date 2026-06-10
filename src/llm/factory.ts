import {
  AnthropicAnalyzer,
  assertApiKey,
  isGeminiModel,
  type ArchitectureAnalyzer,
} from "./client.js";
import { GeminiAnalyzer, assertGeminiApiKey } from "./gemini.js";

/** Provider is inferred from the model id: gemini-* → Gemini, else Anthropic. */
export function createAnalyzer(model: string): ArchitectureAnalyzer {
  return isGeminiModel(model) ? new GeminiAnalyzer(model) : new AnthropicAnalyzer(model);
}

export function assertApiKeyForModel(model: string): void {
  if (isGeminiModel(model)) {
    assertGeminiApiKey();
  } else {
    assertApiKey();
  }
}
