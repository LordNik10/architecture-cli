import { z } from "zod";
import { ArchitectureGraphSchema, type ArchitectureGraph } from "../ir/schema.js";
import { normalizeGraph } from "../ir/normalize.js";
import { ApiError, ConfigError, type ArchitectureAnalyzer } from "./client.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export function assertOpenAIApiKey(): void {
  if (!process.env["OPENAI_API_KEY"]) {
    throw new ConfigError(
      "OPENAI_API_KEY is not set. Get a key at https://platform.openai.com/api-keys and export it.\n" +
        "Tip: `--show-payload` works without a key and shows exactly what would be sent.",
    );
  }
}

/** Structured output via OpenAI's response_format json_schema (REST, no SDK needed). */
export class OpenAIAnalyzer implements ArchitectureAnalyzer {
  constructor(private readonly model: string) {}

  async analyze(payload: string): Promise<ArchitectureGraph> {
    assertOpenAIApiKey();

    const jsonSchema = z.toJSONSchema(ArchitectureGraphSchema);
    delete (jsonSchema as Record<string, unknown>)["$schema"];

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env["OPENAI_API_KEY"]!}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(payload) },
        ],
        max_completion_tokens: 16_000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "architecture_graph", schema: jsonSchema, strict: false },
        },
      }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ConfigError("OpenAI authentication failed — check that OPENAI_API_KEY is valid.");
    }
    if (res.status === 429) {
      throw new ApiError(
        "OpenAI rate limit / quota hit — wait a moment and retry (check your plan's usage limits).",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(`OpenAI API error (${res.status}): ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string; refusal?: string | null };
        finish_reason?: string;
      }[];
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) {
      throw new ApiError(`OpenAI refused the request: ${choice.message.refusal}`);
    }
    const text = choice?.message?.content;
    if (!text) {
      throw new ApiError(
        `OpenAI returned no content (finish_reason: ${choice?.finish_reason ?? "?"}).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError("OpenAI returned invalid JSON despite the response schema.");
    }
    const validated = ArchitectureGraphSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ApiError(
        `OpenAI output does not match the schema: ${validated.error.message.slice(0, 300)}`,
      );
    }
    return normalizeGraph(validated.data);
  }
}
