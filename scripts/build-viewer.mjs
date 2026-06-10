import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "dist", "viewer");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "viewer", "main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: path.join(outDir, "viewer.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.IS_PREACT": '"false"',
  },
  loader: {
    ".woff2": "file",
    ".woff": "file",
    ".ttf": "file",
    ".svg": "dataurl",
  },
  assetNames: "assets/[name]",
  logLevel: "info",
});

// Excalidraw ships its CSS and lazy-loaded font assets in the package; copy
// what the runtime fetches from EXCALIDRAW_ASSET_PATH.
const excalidrawDist = path.join(root, "node_modules", "@excalidraw", "excalidraw", "dist", "prod");
const cssSource = path.join(excalidrawDist, "index.css");
let css = fs.readFileSync(cssSource, "utf8");
fs.writeFileSync(path.join(outDir, "viewer.css"), css);

const fontsDir = path.join(excalidrawDist, "fonts");
if (fs.existsSync(fontsDir)) {
  fs.cpSync(fontsDir, path.join(outDir, "assets", "fonts"), { recursive: true });
}

fs.copyFileSync(path.join(root, "viewer", "index.html"), path.join(outDir, "index.html"));

console.log("viewer built to", outDir);
