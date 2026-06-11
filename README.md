# llm-arch-diagram

> `@lordnik10/llm-arch-diagram`

Scan any project and generate a **system-level architecture board** — like the
classic whiteboard diagrams architects draw (clients, services, APIs, databases,
queues, external systems) — as an editable Excalidraw file, a local web viewer,
and static SVG/PNG. The analysis is done by an LLM you choose (**Claude**,
**ChatGPT**, or **Gemini**).

```sh
npx @lordnik10/llm-arch-diagram
```

That's it — run it inside any project directory and answer the menu.

---

## How to use it (step by step)

### 1. Run the command in your project

Open a terminal **in the root of the project you want to diagram** and run:

```sh
npx @lordnik10/llm-arch-diagram
```

`npx` downloads and runs the CLI without installing it globally. To analyze a
project somewhere else, pass its path: `npx @lordnik10/llm-arch-diagram ./path/to/project`.

### 2. Pick the model (arrow keys)

In an interactive terminal a menu appears. Use **↑/↓** to move and **Enter** to
select. First choose the provider:

```
? Quale modello vuoi usare?
❯ Claude (Anthropic)
  ChatGPT (OpenAI)
  Gemini (Google)
```

then the specific model (each provider lists a few, plus an *“Altro…”* option to
type any model id manually).

### 3. Enter your API key

If the matching environment variable is already set (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, or `GEMINI_API_KEY`), the CLI asks whether to reuse it.
Otherwise it prompts for the key with **masked input** (characters are hidden):

```
? Incolla la tua API key (ANTHROPIC_API_KEY) — input nascosto ********
```

🔒 **The key stays in memory for that single run only** — it is never written to
disk, never logged, and never included in what's sent to the model. Get a key
here:

| Provider | Where to get a key |
| --- | --- |
| Claude (Anthropic) | <https://console.anthropic.com> |
| ChatGPT (OpenAI) | <https://platform.openai.com/api-keys> |
| Gemini (Google) | <https://aistudio.google.com> (free tier) |

### 4. Let it scan, analyze, and render

The CLI then:

1. **Scans** the project for architectural signals: `package.json` (incl. pnpm /
   turbo / nx monorepos and framework detection), `pom.xml` / `build.gradle`
   (Spring Boot, multi-module builds), `docker-compose`, Dockerfiles,
   Kubernetes/Helm manifests, Terraform.
2. **Analyzes** with the model you chose to produce a semantic architecture graph
   — deployable units and infrastructure, **not** a file-dependency graph.
3. **Renders** the result and **opens a local web viewer in your browser**.

## What you get

After a run you'll have a `.llm-arch-diagram/` directory in your project and a
viewer open in the browser:

- **`architecture.excalidraw`** — the editable board. Open it on
  [excalidraw.com](https://excalidraw.com) (or the VS Code Excalidraw extension)
  to tweak it. Nodes keep their arrow bindings and layer groupings when you drag
  them.
- **A local web viewer** — opens automatically; export **PNG/SVG** from its UI.
  Press **Ctrl+C** in the terminal to stop it.
- **`architecture.svg` / `architecture.png`** — static images, generated when you
  pass `--format` (see below).
- **`architecture.json`** — the raw architecture graph, with `--format json`.

The board models your system at the level of **deployable units and
infrastructure**: clients, backend services, databases, queues, caches, and
inferred external systems (e.g. a Stripe SDK → *Stripe*, an S3 client → *AWS
S3*), grouped into layers / bounded contexts.

---

## Options

```
npx @lordnik10/llm-arch-diagram [path] [options]

  -o, --output <dir>    output directory                  (default: .llm-arch-diagram)
  -f, --format <list>   excalidraw,svg,png,json           (default: excalidraw)
      --model <id>      Claude / gpt-*,o* (OpenAI) / gemini-* (Gemini)
                                                          (default: claude-sonnet-4-6)
      --refresh         ignore cache, re-run the analysis
      --no-open         don't open the browser
      --no-serve        generate files only, skip the viewer
      --direction <d>   layout direction: right | down    (default: right)
      --show-payload    print exactly what would be sent to the API, then exit
```

### Non-interactive / CI

To skip the menu entirely, pin the model with `--model` and provide the key via
an environment variable. The provider is inferred from the id:

```sh
export OPENAI_API_KEY=sk-...
npx @lordnik10/llm-arch-diagram --model gpt-4o --no-serve --format svg,png
```

```sh
npx @lordnik10/llm-arch-diagram --model gemini-2.5-flash    # Gemini  (GEMINI_API_KEY)
npx @lordnik10/llm-arch-diagram --model claude-sonnet-4-6   # Claude  (ANTHROPIC_API_KEY)
```

⚠️ On the Google (Gemini) free tier your prompts may be used to improve their
products — fine for experiments, avoid confidential codebases.

## Privacy

Only metadata and key files are ever sent to the model:

- the pruned directory tree (names only)
- manifests (`package.json`, `pom.xml`, `build.gradle`, `docker-compose` with
  **environment values masked**, Dockerfiles, Helm `Chart.yaml`)
- `README.md` (first 6 KB) and one canonical entrypoint (first 4 KB)
- `.env.example` key names only — values stripped

Source code, `.env` files, and Terraform contents are never sent. Audit the
exact payload anytime with `--show-payload` (works without an API key). Your API
key is never part of the payload.

## Caching

Results are cached in `.llm-arch-diagram/cache/` keyed on the content of the
files sent and the model used; re-runs are instant until something relevant
changes. Force a re-analysis with `--refresh`. Add `.llm-arch-diagram/` to your
`.gitignore`.

## Requirements

- **Node.js >= 20**
- An API key for one of: Anthropic, OpenAI, or Google Gemini

## Development

```sh
git clone https://github.com/LordNik10/architecture-cli.git
cd architecture-cli
npm install
npm run build      # CLI (tsup) + viewer bundle (esbuild)
npm test           # vitest
npm run typecheck
```

Manual acceptance checklist:

1. Open the generated `.excalidraw` on excalidraw.com — drag a node: arrows must
   stay attached (bindings).
2. Layer boxes drag together with their members (groupIds).
3. Running the CLI in a sample repo opens the viewer; export PNG works; Ctrl+C
   stops the viewer and exits.
4. `--show-payload` contains nothing outside the allowlist.

## Exit codes

- `1` configuration error (missing/invalid API key, bad flags)
- `2` no architectural signals found in the project
- `3` model/API failure (Anthropic, OpenAI, or Gemini)
- `130` cancelled at the interactive prompt (Ctrl+C / Esc)

## License

MIT
