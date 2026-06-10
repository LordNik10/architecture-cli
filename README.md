# architecture-cli

Scan any project and generate a system-level architecture board — like the
classic whiteboard diagrams (clients, services, APIs, databases, queues,
external systems) — as an editable Excalidraw file, a local web viewer, and
static SVG/PNG.

```
npx architecture-cli
```

Run it inside any project. In an interactive terminal it first shows a menu:
pick the model — **Claude**, **ChatGPT**, or **Gemini** — with the arrow keys,
then paste your API key (masked input). It will:

1. **Scan** the project for architectural signals: `package.json` (incl. pnpm /
   turbo / nx monorepos and framework detection), `pom.xml` / `build.gradle`
   (Spring Boot, multi-module builds), `docker-compose`, Dockerfiles,
   Kubernetes/Helm manifests, Terraform.
2. **Analyze** with the chosen model (Claude / OpenAI / Gemini) to produce a
   semantic architecture graph — deployable units and infrastructure, not a
   file dependency graph.
3. **Render** the result:
   - `architecture.excalidraw` — open and edit on [excalidraw.com](https://excalidraw.com)
   - a local web viewer (opens in your browser; export PNG/SVG from the UI)
   - `architecture.svg` / `architecture.png` with `--format`

## Setup

The easiest path: just run `npx architecture-cli` in an interactive terminal
and answer the menu — choose the provider/model with the arrow keys and paste
your API key when prompted. The key stays in memory for that run only; it is
**never written to disk, logged, or included in the analysis payload**.

Prefer environment variables (recommended for scripts/CI)? Export the key for
your provider and the menu will offer to reuse it:

```sh
export ANTHROPIC_API_KEY=sk-ant-...   # Claude   — console.anthropic.com
export OPENAI_API_KEY=sk-...          # ChatGPT  — platform.openai.com/api-keys
export GEMINI_API_KEY=...             # Gemini   — aistudio.google.com (free tier)
```

To skip the menu entirely (non-interactive / CI), pin the model with `--model`;
the provider is inferred from the id:

```sh
npx architecture-cli --model gpt-4o              # OpenAI  (OPENAI_API_KEY)
npx architecture-cli --model gemini-2.0-flash    # Gemini  (GEMINI_API_KEY)
npx architecture-cli --model claude-sonnet-4-6   # Claude  (ANTHROPIC_API_KEY)
```

⚠️ On the Google (Gemini) free tier your prompts may be used to improve their
products — fine for experiments, avoid confidential codebases.

## Usage

```
npx architecture-cli [path] [options]

  -o, --output <dir>    output directory                  (default: .architecture-cli)
  -f, --format <list>   excalidraw,svg,png,json           (default: excalidraw)
      --model <id>      Claude / gpt-*,o* (OpenAI) / gemini-* (Gemini)
                                                          (default: claude-sonnet-4-6)
      --refresh         ignore cache, re-run the analysis
      --no-open         don't open the browser
      --no-serve        generate files only, skip the viewer
      --direction <d>   layout direction: right | down    (default: right)
      --show-payload    print exactly what would be sent to the API, then exit
```

## Privacy

Only metadata and key files are ever sent to the API:

- the pruned directory tree (names only)
- manifests (`package.json`, `pom.xml`, `build.gradle`, `docker-compose` with
  **environment values masked**, Dockerfiles, Helm `Chart.yaml`)
- `README.md` (first 6 KB) and one canonical entrypoint (first 4 KB)
- `.env.example` key names only — values stripped

Source code, `.env` files, and Terraform contents are never sent. Audit the
exact payload anytime with `--show-payload` (works without an API key).

## Caching

Results are cached in `.architecture-cli/cache/` keyed on the content of the
files sent and the model used; re-runs are instant until something relevant
changes. Force a re-analysis with `--refresh`. Add `.architecture-cli/` to
your `.gitignore`.

## Development

```sh
npm install
npm run build      # CLI (tsup) + viewer bundle (esbuild)
npm test           # vitest
npm run typecheck
```

Manual acceptance checklist:

1. Open the generated `.excalidraw` on excalidraw.com — drag a node: arrows
   must stay attached (bindings).
2. Layer boxes drag together with their members (groupIds).
3. `npx architecture-cli` in a sample repo opens the viewer; export PNG works.
4. `--show-payload` contains nothing outside the allowlist.

## Exit codes

- `1` configuration error (missing/invalid API key, bad flags)
- `2` no architectural signals found in the project
- `3` model/API failure (Anthropic, OpenAI, or Gemini)
- `130` cancelled at the interactive prompt (Ctrl+C / Esc)
