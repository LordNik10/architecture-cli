import { z } from "zod";
import { ArchitectureGraphSchema, type ArchitectureGraph } from "../ir/schema.js";
import { normalizeGraph } from "../ir/normalize.js";
import { ApiError, ConfigError, type ArchitectureAnalyzer } from "./client.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function assertGeminiApiKey(): void {
  if (!process.env["GEMINI_API_KEY"]) {
    throw new ConfigError(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com and export it.\n" +
        "Note: on the Google free tier your prompts may be used to improve their products — " +
        "avoid running it on confidential codebases.",
    );
  }
}

/** Structured output via Gemini's responseJsonSchema (REST, no SDK needed). */
export class GeminiAnalyzer implements ArchitectureAnalyzer {
  constructor(private readonly model: string) {}

  async analyze(payload: string): Promise<ArchitectureGraph> {
    assertGeminiApiKey();

    const jsonSchema = z.toJSONSchema(ArchitectureGraphSchema);
    delete (jsonSchema as Record<string, unknown>)["$schema"];

    const res = await fetch(`${BASE_URL}/${this.model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env["GEMINI_API_KEY"]!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserMessage(payload) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          maxOutputTokens: 16_000,
        },
      }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ConfigError("Gemini authentication failed — check that GEMINI_API_KEY is valid.");
    }
    if (res.status === 429) {
      throw new ApiError(
        "Gemini rate limit hit (free tier is heavily limited) — wait a minute and retry.",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(`Gemini API error (${res.status}): ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) {
      throw new ApiError(
        `Gemini returned no content (finishReason: ${data.candidates?.[0]?.finishReason ?? "?"}).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError("Gemini returned invalid JSON despite the response schema.");
    }
    const validated = ArchitectureGraphSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ApiError(`Gemini output does not match the schema: ${validated.error.message.slice(0, 300)}`);
    }
    return normalizeGraph(validated.data);
  }
}
