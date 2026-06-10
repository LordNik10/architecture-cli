import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { computeCacheKey, readCache, writeCache } from "./cache/cache.js";
import type { ArchitectureGraph } from "./ir/schema.js";
import { layoutGraph } from "./layout/elk.js";
import type { LayoutDirection } from "./layout/types.js";
import type { ArchitectureAnalyzer } from "./llm/client.js";
import { renderExcalidraw, validateScene, type ExcalidrawScene } from "./render/excalidraw.js";
import { renderPng, renderSvg } from "./render/svg.js";
import { buildPayload } from "./scan/key-files.js";
import { makeReader, scanProject } from "./scan/index.js";

export type OutputFormat = "excalidraw" | "svg" | "png" | "json";

export interface PipelineOptions {
  rootDir: string;
  outputDir: string;
  formats: OutputFormat[];
  direction: LayoutDirection;
  model: string;
  cliVersion: string;
  refresh: boolean;
  analyzer: ArchitectureAnalyzer;
  log: (message: string) => void;
}

export interface PipelineResult {
  graph: ArchitectureGraph;
  scene: ExcalidrawScene;
  writtenFiles: string[];
  fromCache: boolean;
}

export class ScanEmptyError extends Error {}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { log } = opts;

  log(`Scanning ${opts.rootDir} …`);
  const scan = scanProject(opts.rootDir);
  if (scan.signals.length === 0) {
    throw new ScanEmptyError(
      "No architectural signals found. Looked for: package.json, pom.xml, build.gradle, " +
        "docker-compose, Dockerfile, Kubernetes manifests, Terraform.",
    );
  }
  for (const signal of scan.signals.slice(0, 8)) {
    log(pc.dim(`  • ${signal.summary}`));
  }
  if (scan.signals.length > 8) log(pc.dim(`  • … and ${scan.signals.length - 8} more`));

  const read = makeReader(opts.rootDir);
  const cacheKey = computeCacheKey(scan, read, opts.model, opts.cliVersion);

  let graph: ArchitectureGraph | null = null;
  let fromCache = false;
  if (!opts.refresh) {
    graph = readCache(opts.outputDir, cacheKey);
    if (graph) {
      fromCache = true;
      log(`Using cached analysis ${pc.dim("(--refresh to regenerate)")}`);
    }
  }

  if (!graph) {
    const payload = buildPayload(scan, read);
    log(`Asking the model (${opts.model}) …`);
    graph = await opts.analyzer.analyze(payload);
    writeCache(opts.outputDir, cacheKey, opts.model, graph);
  }

  log(`Layouting ${graph.nodes.length} nodes, ${graph.edges.length} edges …`);
  const positioned = await layoutGraph(graph, opts.direction);
  const scene = renderExcalidraw(positioned);
  validateScene(scene);

  fs.mkdirSync(opts.outputDir, { recursive: true });
  const writtenFiles: string[] = [];
  const write = (name: string, content: string | Buffer) => {
    const file = path.join(opts.outputDir, name);
    fs.writeFileSync(file, content);
    writtenFiles.push(file);
    log(`Wrote ${pc.green(path.relative(process.cwd(), file) || file)}`);
  };

  if (opts.formats.includes("excalidraw")) {
    write("architecture.excalidraw", JSON.stringify(scene, null, 2));
  }
  if (opts.formats.includes("json")) {
    write("architecture.json", JSON.stringify(graph, null, 2));
  }
  if (opts.formats.includes("svg") || opts.formats.includes("png")) {
    const svg = renderSvg(positioned);
    if (opts.formats.includes("svg")) write("architecture.svg", svg);
    if (opts.formats.includes("png")) {
      const png = await renderPng(svg);
      if (png) {
        write("architecture.png", png);
      } else {
        log(
          pc.yellow(
            "PNG export unavailable (@resvg/resvg-js missing) — use --format svg or the viewer's export button.",
          ),
        );
      }
    }
  }

  return { graph, scene, writtenFiles, fromCache };
}

export function buildPayloadOnly(rootDir: string): string {
  const scan = scanProject(rootDir);
  return buildPayload(scan, makeReader(rootDir));
}
