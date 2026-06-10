import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { ApiError, ConfigError, DEFAULT_MODEL } from "./llm/client.js";
import { assertApiKeyForModel, createAnalyzer } from "./llm/factory.js";
import {
  ScanEmptyError,
  buildPayloadOnly,
  runPipeline,
  type OutputFormat,
} from "./pipeline.js";
import { openBrowser, startViewer } from "./server/viewer.js";

const VERSION = "0.1.0";
const VALID_FORMATS: OutputFormat[] = ["excalidraw", "svg", "png", "json"];

const program = new Command();

program
  .name("architecture-cli")
  .description(
    "Scan a project and generate an Excalidraw-style architecture board.\n" +
      "Requires ANTHROPIC_API_KEY (analysis is done by Claude; only metadata and\n" +
      "key manifest files are sent — use --show-payload to audit).",
  )
  .version(VERSION)
  .argument("[path]", "project directory to analyze", ".")
  .option("-o, --output <dir>", "output directory", ".architecture-cli")
  .option(
    "-f, --format <list>",
    `comma-separated outputs: ${VALID_FORMATS.join(",")}`,
    "excalidraw",
  )
  .option(
    "--model <id>",
    "model id — Anthropic (default) or Gemini with a gemini-* id (uses GEMINI_API_KEY)",
    process.env["ARCHITECTURE_CLI_MODEL"] ?? DEFAULT_MODEL,
  )
  .option("--refresh", "ignore cache and re-run the LLM analysis", false)
  .option("--no-open", "don't open the browser")
  .option("--no-serve", "generate files only, skip the web viewer")
  .option("--direction <dir>", "layout direction: right|down", "right")
  .option("--show-payload", "print exactly what would be sent to the API, then exit", false)
  .option("--verbose", "debug logging", false)
  .action(async (projectPath: string, opts) => {
    const rootDir = path.resolve(projectPath);

    try {
      if (opts.showPayload) {
        process.stdout.write(buildPayloadOnly(rootDir) + "\n");
        return;
      }

      const formats = String(opts.format)
        .split(",")
        .map((f: string) => f.trim().toLowerCase()) as OutputFormat[];
      for (const f of formats) {
        if (!VALID_FORMATS.includes(f)) {
          throw new ConfigError(`Unknown format '${f}'. Valid: ${VALID_FORMATS.join(", ")}`);
        }
      }
      if (opts.direction !== "right" && opts.direction !== "down") {
        throw new ConfigError("--direction must be 'right' or 'down'");
      }

      // Fail fast before scanning if the key is missing.
      assertApiKeyForModel(opts.model);

      const outputDir = path.resolve(rootDir, opts.output);
      const started = Date.now();
      const result = await runPipeline({
        rootDir,
        outputDir,
        formats,
        direction: opts.direction,
        model: opts.model,
        cliVersion: VERSION,
        refresh: Boolean(opts.refresh),
        analyzer: createAnalyzer(opts.model),
        log: (msg) => console.log(msg),
      });

      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `${pc.green("✓")} ${result.graph.title} — ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges ${pc.dim(`(${elapsed}s)`)}`,
      );
      console.log(pc.dim(result.graph.summary));
      console.log(
        pc.dim(`Tip: add ${path.basename(outputDir)}/ to your .gitignore if you don't want to commit it.`),
      );

      if (opts.serve) {
        const { url } = await startViewer(result.scene);
        console.log(`Viewer: ${pc.cyan(url)} ${pc.dim("(Ctrl+C to stop)")}`);
        if (opts.open) openBrowser(url);
        // keep the process alive while the server runs
        await new Promise<void>((resolve) => {
          process.on("SIGINT", () => resolve());
          process.on("SIGTERM", () => resolve());
        });
      }
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error(pc.red(`✗ ${err.message}`));
        process.exit(1);
      }
      if (err instanceof ScanEmptyError) {
        console.error(pc.red(`✗ ${err.message}`));
        process.exit(2);
      }
      if (err instanceof ApiError) {
        console.error(pc.red(`✗ ${err.message}`));
        process.exit(3);
      }
      console.error(pc.red(`✗ unexpected error: ${err instanceof Error ? (opts.verbose ? err.stack : err.message) : String(err)}`));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
