import { confirm, input, password, select } from "@inquirer/prompts";
import pc from "picocolors";
import { ConfigError, type Provider } from "./client.js";

interface ProviderInfo {
  id: Provider;
  label: string;
  /** Env var that holds the key — also where the typed key is stashed (in-memory only). */
  envVar: string;
  keyUrl: string;
  models: { name: string; value: string }[];
}

const CUSTOM = "__custom__";

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    envVar: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com",
    models: [
      { name: "Claude Sonnet 4.6  — consigliato", value: "claude-sonnet-4-6" },
      { name: "Claude Opus 4.8    — più potente", value: "claude-opus-4-8" },
      { name: "Claude Haiku 4.5   — veloce/economico", value: "claude-haiku-4-5-20251001" },
    ],
  },
  {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    envVar: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { name: "GPT-4o       — consigliato", value: "gpt-4o" },
      { name: "GPT-4o mini  — veloce/economico", value: "gpt-4o-mini" },
      { name: "GPT-4.1", value: "gpt-4.1" },
    ],
  },
  {
    id: "gemini",
    label: "Gemini (Google)",
    envVar: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com",
    models: [
      { name: "Gemini 2.5 Flash — consigliato", value: "gemini-2.5-flash" },
      { name: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
      { name: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
    ],
  },
];

/**
 * Interactive model picker. Lets the user choose a provider + model with the
 * arrow keys and supplies the API key.
 *
 * Privacy: the key is read from the existing env var when present (the user
 * controls it), or typed into a masked prompt. It is only ever held in this
 * process's memory for the duration of the run — never written to disk, logged,
 * or included in the analysis payload.
 *
 * Returns the chosen model id; the matching API-key env var is set in-process.
 */
export async function runInteractiveSetup(): Promise<string> {
  const providerId = await select<Provider>({
    message: "Quale modello vuoi usare?",
    choices: PROVIDERS.map((p) => ({ name: p.label, value: p.id })),
  });
  const provider = PROVIDERS.find((p) => p.id === providerId)!;

  const picked = await select<string>({
    message: `Modello — ${provider.label}`,
    choices: [
      ...provider.models.map((m) => ({ name: m.name, value: m.value })),
      { name: "Altro — inserisci un id manualmente…", value: CUSTOM },
    ],
  });

  let model = picked;
  if (picked === CUSTOM) {
    model = (
      await input({
        message: `Id del modello (${provider.id}):`,
        validate: (v) => (v.trim().length > 0 ? true : "Inserisci un id valido"),
      })
    ).trim();
  }

  await ensureApiKey(provider);
  return model;
}

async function ensureApiKey(provider: ProviderInfo): Promise<void> {
  const existing = process.env[provider.envVar];
  if (existing && existing.trim()) {
    const reuse = await confirm({
      message: `Ho trovato ${provider.envVar} nell'ambiente. Vuoi usarla?`,
      default: true,
    });
    if (reuse) return;
  }

  console.log(
    pc.dim(
      `La key resta solo in memoria per questa esecuzione: non viene salvata su disco, ` +
        `né registrata nei log, né inviata nel payload di analisi. Ottienila su ${provider.keyUrl}`,
    ),
  );
  const key = await password({
    message: `Incolla la tua API key (${provider.envVar}) — input nascosto`,
    mask: "*",
    validate: (v) => (v.trim().length > 0 ? true : "La key non può essere vuota"),
  });
  process.env[provider.envVar] = key.trim();
}
