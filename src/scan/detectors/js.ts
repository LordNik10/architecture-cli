import type { Detector, FileReader, Signal } from "../types.js";

const FRAMEWORK_DEPS: Record<string, string> = {
  next: "Next.js",
  react: "React",
  "@angular/core": "Angular",
  vue: "Vue",
  svelte: "Svelte",
  "@nestjs/core": "NestJS",
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  hono: "Hono",
  vite: "Vite",
  "react-native": "React Native",
  electron: "Electron",
};

const MONOREPO_FILES = ["pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json"];

function frameworksOf(deps: string[]): string[] {
  const found: string[] = [];
  for (const [dep, name] of Object.entries(FRAMEWORK_DEPS)) {
    if (deps.includes(dep)) found.push(name);
  }
  return found;
}

export const jsDetector: Detector = {
  name: "js",
  detect(files: string[], read: FileReader) {
    const signals: Signal[] = [];
    const keyFiles: string[] = [];

    const packageJsons = files
      .filter((f) => f === "package.json" || f.endsWith("/package.json"))
      .sort((a, b) => a.split("/").length - b.split("/").length)
      .slice(0, 30);

    for (const pkgPath of packageJsons) {
      const raw = read(pkgPath);
      if (!raw) continue;
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(raw);
      } catch {
        continue;
      }
      keyFiles.push(pkgPath);

      const deps = Object.keys({
        ...(pkg["dependencies"] as object | undefined),
        ...(pkg["devDependencies"] as object | undefined),
      });
      const frameworks = frameworksOf(deps);
      const name = typeof pkg["name"] === "string" ? pkg["name"] : pkgPath;
      const fw = frameworks.length > 0 ? ` (${frameworks.join(", ")})` : "";
      signals.push({ source: "js", summary: `Node package: ${name}${fw}` });

      if (pkg["workspaces"]) {
        signals.push({ source: "js", summary: `npm/yarn workspaces in ${pkgPath}` });
      }
    }

    for (const marker of MONOREPO_FILES) {
      if (files.includes(marker)) {
        keyFiles.push(marker);
        signals.push({ source: "js", summary: `monorepo tooling: ${marker}` });
      }
    }

    return { signals, keyFiles };
  },
};
