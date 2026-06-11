import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { ApiError, ConfigError, DEFAULT_MODEL } from "./llm/client.js";
import { assertApiKeyForModel, createAnalyzer } from "./llm/factory.js";
import { runInteractiveSetup } from "./llm/interactive.js";
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
  .name("llm-arch-diagram")
  .description(
    "Scan a project and generate an Excalidraw-style architecture board.\n" +
      "In an interactive terminal, pick the model (Claude / ChatGPT / Gemini) and enter\n" +
      "your API key from a menu. Analysis sends only metadata and key manifest files —\n" +
      "use --show-payload to audit. The API key stays in memory and is never persisted.",
  )
  .version(VERSION)
  .argument("[path]", "project directory to analyze", ".")
  .option("-o, --output <dir>", "output directory", ".llm-arch-diagram")
  .option(
    "-f, --format <list>",
    `comma-separated outputs: ${VALID_FORMATS.join(",")}`,
    "excalidraw",
  )
  .option(
    "--model <id>",
    "model id — Claude (default), or a gpt-*/o* id for OpenAI, or a gemini-* id for Gemini.\n" +
      "Omit it in an interactive terminal to pick the model and enter the API key from a menu.",
    process.env["LLM_ARCH_DIAGRAM_MODEL"] ?? DEFAULT_MODEL,
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

      // In an interactive terminal, when the user didn't pin a model with --model,
      // let them pick the provider/model and supply the key via the arrow menu.
      const modelExplicit = program.getOptionValueSource("model") !== "default";
      if (process.stdin.isTTY && !modelExplicit) {
        opts.model = await runInteractiveSetup();
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
        const { url, close } = await startViewer(result.scene);
        console.log(`Viewer: ${pc.cyan(url)} ${pc.dim("(Ctrl+C to stop)")}`);
        if (opts.open) openBrowser(url);
        // Keep the process alive while the server runs, then shut it down on
        // Ctrl+C so the process can actually exit (the listening server and
        // any keep-alive connections from the browser otherwise hold the
        // event loop open forever).
        await new Promise<void>((resolve) => {
          const stop = () => {
            close();
            resolve();
          };
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
        });
        console.log(pc.dim("Viewer stopped."));
      }
    } catch (err) {
      // User pressed Ctrl+C / Esc at an interactive prompt — exit quietly.
      if (err instanceof Error && err.name === "ExitPromptError") {
        console.error(pc.dim("Annullato."));
        process.exit(130);
      }
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
