import fs from "node:fs";
import path from "node:path";
import ignoreFactory, { type Ignore } from "ignore";

const DENYLIST = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  ".gradle",
  ".terraform",
  "coverage",
  ".idea",
  ".vscode",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".architecture-cli",
  ".turbo",
  ".cache",
]);

const MAX_DEPTH = 8;
const MAX_DIRS = 5_000;
const MAX_FILES = 20_000;
export const MAX_FILE_READ_BYTES = 64 * 1024;
const MAX_ENTRIES_PER_DIR_IN_TREE = 40;

export interface WalkResult {
  /** Relative paths (posix separators) of all listed files. */
  files: string[];
  /** Pruned directory tree rendered as an indented string. */
  tree: string;
  truncated: boolean;
}

export function walkProject(rootDir: string): WalkResult {
  const ig: Ignore = ignoreFactory();
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, "utf8"));
  }

  const files: string[] = [];
  const treeLines: string[] = [];
  let dirCount = 0;
  let truncated = false;

  const visit = (dir: string, rel: string, depth: number) => {
    if (depth > MAX_DEPTH || dirCount >= MAX_DIRS || files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    dirCount++;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    let shown = 0;
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (DENYLIST.has(entry.name)) continue;
        if (ig.ignores(`${relPath}/`)) continue;
        if (shown < MAX_ENTRIES_PER_DIR_IN_TREE) {
          treeLines.push(`${"  ".repeat(depth)}${entry.name}/`);
          shown++;
        } else {
          truncated = true;
        }
        visit(path.join(dir, entry.name), relPath, depth + 1);
      } else if (entry.isFile()) {
        if (ig.ignores(relPath)) continue;
        if (files.length >= MAX_FILES) {
          truncated = true;
          break;
        }
        files.push(relPath);
        if (shown < MAX_ENTRIES_PER_DIR_IN_TREE) {
          treeLines.push(`${"  ".repeat(depth)}${entry.name}`);
          shown++;
        } else {
          truncated = true;
        }
      }
    }
  };

  visit(rootDir, "", 0);
  return { files, tree: treeLines.join("\n"), truncated };
}

/**
 * Read a project file capped at MAX_FILE_READ_BYTES; returns null for missing
 * or binary-looking content.
 */
export function readProjectFile(rootDir: string, relPath: string): string | null {
  const abs = path.join(rootDir, relPath);
  let fd: number;
  try {
    fd = fs.openSync(abs, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, MAX_FILE_READ_BYTES, 0);
    const slice = buf.subarray(0, bytesRead);
    if (slice.includes(0)) return null; // binary sniff
    const stat = fs.fstatSync(fd);
    let text = slice.toString("utf8");
    if (stat.size > MAX_FILE_READ_BYTES) text += "\n…[truncated]";
    return text;
  } finally {
    fs.closeSync(fd);
  }
}
