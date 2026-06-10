import YAML from "yaml";
import type { FileReader, ScanResult } from "./types.js";

export const PAYLOAD_BUDGET_CHARS = 120_000;
const README_CAP = 6 * 1024;
const ENTRYPOINT_CAP = 4 * 1024;

/** Canonical entrypoint paths — the only source files ever sent. */
const ENTRYPOINT_CANDIDATES = [
  "src/main.ts",
  "src/main.js",
  "src/index.ts",
  "src/index.js",
  "src/app.module.ts",
  "src/App.tsx",
];

interface PayloadSection {
  title: string;
  content: string;
  /** Lower = dropped first when over budget. */
  priority: number;
}

/** Mask environment values in a docker-compose document (keys survive). */
export function sanitizeCompose(raw: string): string {
  try {
    const doc = YAML.parse(raw);
    for (const service of Object.values<Record<string, unknown>>(doc?.services ?? {})) {
      const env = service?.["environment"];
      if (Array.isArray(env)) {
        service["environment"] = env.map((entry) =>
          typeof entry === "string" ? `${entry.split("=")[0]}=***` : entry,
        );
      } else if (env && typeof env === "object") {
        service["environment"] = Object.fromEntries(
          Object.keys(env).map((k) => [k, "***"]),
        );
      }
    }
    return YAML.stringify(doc);
  } catch {
    return raw;
  }
}

/** Keep only the key names of an env file. */
export function envKeysOnly(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return null;
      return trimmed.split("=")[0];
    })
    .filter(Boolean)
    .join("\n");
}

function fileSection(
  relPath: string,
  content: string,
  priority: number,
): PayloadSection {
  return { title: `FILE: ${relPath}`, content, priority };
}

/**
 * Assemble the exact text sent to the LLM. Strict allowlist: directory tree,
 * detector-selected manifests (compose env values masked), README, canonical
 * entrypoints, .env.example key names. Nothing else.
 */
export function buildPayload(scan: ScanResult, read: FileReader): string {
  const sections: PayloadSection[] = [];

  sections.push({
    title: "DIRECTORY TREE (pruned)",
    content: scan.tree + (scan.treeTruncated ? "\n…[tree truncated]" : ""),
    priority: 100,
  });

  if (scan.signals.length > 0) {
    sections.push({
      title: "DETECTED SIGNALS",
      content: scan.signals.map((s) => `- [${s.source}] ${s.summary}`).join("\n"),
      priority: 95,
    });
  }

  const seen = new Set<string>();
  for (const keyPath of scan.keyFilePaths) {
    if (seen.has(keyPath)) continue;
    seen.add(keyPath);
    const raw = read(keyPath);
    if (raw === null) continue;
    const isCompose = /(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(keyPath);
    const content = isCompose ? sanitizeCompose(raw) : raw;
    // compose files describe the service topology — never drop them
    sections.push(fileSection(keyPath, content, isCompose ? 90 : 60));
  }

  const readme = scan.files.find((f) => /^readme\.md$/i.test(f));
  if (readme) {
    const raw = read(readme);
    if (raw) sections.push(fileSection(readme, raw.slice(0, README_CAP), 40));
  }

  for (const candidate of ENTRYPOINT_CANDIDATES) {
    const match = scan.files.find(
      (f) => f === candidate || f.endsWith(`/${candidate}`),
    );
    if (match) {
      const raw = read(match);
      if (raw) {
        sections.push(fileSection(match, raw.slice(0, ENTRYPOINT_CAP), 20));
        break;
      }
    }
  }

  const envExample = scan.files.find((f) =>
    /(^|\/)\.env\.(example|template|sample)$/.test(f),
  );
  if (envExample) {
    const raw = read(envExample);
    if (raw) {
      sections.push(
        fileSection(`${envExample} (keys only)`, envKeysOnly(raw), 30),
      );
    }
  }

  // Enforce the budget: drop lowest-priority sections first.
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);
  const kept: PayloadSection[] = [];
  let total = 0;
  for (const section of sorted) {
    const size = section.title.length + section.content.length + 16;
    if (total + size > PAYLOAD_BUDGET_CHARS) continue;
    kept.push(section);
    total += size;
  }

  // Restore original ordering for readability.
  const keptSet = new Set(kept);
  return sections
    .filter((s) => keptSet.has(s))
    .map((s) => `=== ${s.title} ===\n${s.content}`)
    .join("\n\n");
}
