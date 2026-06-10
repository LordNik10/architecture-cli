import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExcalidrawScene } from "../render/excalidraw.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function viewerDistDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // bundled: dist/cli.js sits next to dist/viewer/
  const bundled = path.join(here, "viewer");
  if (fs.existsSync(bundled)) return bundled;
  // dev (tsx from src/server/): fall back to <root>/dist/viewer
  return path.join(here, "..", "..", "dist", "viewer");
}

export function startViewer(scene: ExcalidrawScene): Promise<{ url: string; close: () => void }> {
  const dir = viewerDistDir();
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    throw new Error(
      `viewer assets not found at ${dir} — the package build is incomplete (run \`npm run build:viewer\`).`,
    );
  }
  const sceneJson = JSON.stringify(scene);

  const server = http.createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0]!;
    if (url === "/scene.json") {
      res.writeHead(200, { "content-type": MIME[".json"]! });
      res.end(sceneJson);
      return;
    }
    const relPath = url === "/" ? "index.html" : url.slice(1);
    const filePath = path.join(dir, relPath);
    // path traversal guard
    if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const mime = MIME[path.extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": mime });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("failed to bind viewer server"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => {
          // closeAllConnections() drops the browser's keep-alive sockets so the
          // server actually stops; without it server.close() waits for them.
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    spawn(cmd[0]!, cmd.slice(1), { stdio: "ignore", detached: true }).unref();
  } catch {
    // non-fatal: the URL is printed anyway
  }
}
