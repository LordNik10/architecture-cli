import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: false,
  banner: {
    // createRequire shim: bundled CJS deps (yaml, elkjs) call require()
    js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  // Bundle pure-JS deps so `npx` installs stay small; keep the native optional
  // dep external so its absence never breaks the bundle.
  noExternal: [
    "commander",
    "elkjs",
    "fast-xml-parser",
    "ignore",
    "picocolors",
    "yaml",
    "zod",
    "@anthropic-ai/sdk",
  ],
  external: ["@resvg/resvg-js"],
});
