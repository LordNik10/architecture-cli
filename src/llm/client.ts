import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ArchitectureGraphSchema, type ArchitectureGraph } from "../ir/schema.js";
import { normalizeGraph } from "../ir/normalize.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Injectable for tests. */
export interface ArchitectureAnalyzer {
  analyze(payload: string): Promise<ArchitectureGraph>;
}

export class ConfigError extends Error {}
export class ApiError extends Error {}

export function assertApiKey(): void {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new ConfigError(
      "ANTHROPIC_API_KEY is not set. Get a key at https://console.anthropic.com and export it.\n" +
        "Tip: `--show-payload` works without a key and shows exactly what would be sent.",
    );
  }
}

export class AnthropicAnalyzer implements ArchitectureAnalyzer {
  constructor(private readonly model: string = DEFAULT_MODEL) {}

  async analyze(payload: string): Promise<ArchitectureGraph> {
    assertApiKey();
    const client = new Anthropic();
    let response;
    try {
      response = await client.messages.parse({
        model: this.model,
        max_tokens: 16_000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(payload) }],
        output_config: { format: zodOutputFormat(ArchitectureGraphSchema) },
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ConfigError(
          "Authentication failed — check that ANTHROPIC_API_KEY is valid.",
        );
      }
      if (err instanceof Anthropic.APIError) {
        throw new ApiError(`Anthropic API error (${err.status ?? "?"}): ${err.message}`);
      }
      throw err;
    }
    const graph = response.parsed_output;
    if (!graph) {
      throw new ApiError(
        `Model did not return a parseable architecture graph (stop_reason: ${response.stop_reason}).`,
      );
    }
    return normalizeGraph(ArchitectureGraphSchema.parse(graph));
  }
}
