import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ArchitectureGraph } from "../ir/schema.js";
import type { FileReader, ScanResult } from "../scan/types.js";

const CACHE_FORMAT_VERSION = 1;
const MAX_ENTRIES = 5;

interface CacheEntry {
  key: string;
  createdAt: string;
  model: string;
  graph: ArchitectureGraph;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Key over the exact LLM inputs: model, prompt-relevant CLI version, the tree
 * shape and the content of every key file actually sent. Edits to unscanned
 * source files don't invalidate.
 */
export function computeCacheKey(
  scan: ScanResult,
  read: FileReader,
  model: string,
  cliVersion: string,
): string {
  const fileHashes = [...new Set(scan.keyFilePaths)]
    .sort()
    .map((p) => ({ path: p, hash: sha256(read(p) ?? "") }));
  return sha256(
    JSON.stringify({
      v: CACHE_FORMAT_VERSION,
      cliVersion,
      model,
      treeSignature: sha256(scan.tree),
      files: fileHashes,
    }),
  );
}

function cacheDir(outputDir: string): string {
  return path.join(outputDir, "cache");
}

export function readCache(outputDir: string, key: string): ArchitectureGraph | null {
  const file = path.join(cacheDir(outputDir), `${key}.json`);
  try {
    const entry: CacheEntry = JSON.parse(fs.readFileSync(file, "utf8"));
    return entry.graph;
  } catch {
    return null;
  }
}

export function writeCache(
  outputDir: string,
  key: string,
  model: string,
  graph: ArchitectureGraph,
  now: Date = new Date(),
): void {
  const dir = cacheDir(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  const entry: CacheEntry = { key, createdAt: now.toISOString(), model, graph };
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(entry, null, 2));

  // Simple GC: keep only the newest entries.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(MAX_ENTRIES)) {
    fs.rmSync(path.join(dir, f), { force: true });
  }
}
