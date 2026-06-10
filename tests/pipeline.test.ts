import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArchitectureGraph } from "../src/ir/schema.js";
import type { ArchitectureAnalyzer } from "../src/llm/client.js";
import { runPipeline } from "../src/pipeline.js";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

const cannedGraph: ArchitectureGraph = {
  title: "Compose Stack",
  summary: "Web + API + DB.",
  nodes: [
    { id: "web", kind: "client", label: "Web", sublabel: null, parentId: null, description: null },
    { id: "api", kind: "service", label: "API", sublabel: null, parentId: null, description: null },
    { id: "db", kind: "database", label: "DB", sublabel: "PostgreSQL", parentId: null, description: null },
  ],
  edges: [
    { id: "e1", from: "web", to: "api", label: "HTTP", bidirectional: false },
    { id: "e2", from: "api", to: "db", label: "reads/writes", bidirectional: false },
  ],
};

class MockAnalyzer implements ArchitectureAnalyzer {
  calls = 0;
  async analyze(): Promise<ArchitectureGraph> {
    this.calls++;
    return structuredClone(cannedGraph);
  }
}

describe("runPipeline", () => {
  let outputDir: string;
  beforeEach(() => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "archcli-test-"));
  });
  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  const baseOptions = (analyzer: MockAnalyzer) => ({
    rootDir: fixture("compose-stack"),
    outputDir,
    formats: ["excalidraw", "svg", "json"] as ("excalidraw" | "svg" | "json")[],
    direction: "right" as const,
    model: "test-model",
    cliVersion: "0.0.0-test",
    refresh: false,
    analyzer,
    log: () => {},
  });

  it("writes valid excalidraw, svg and json outputs", async () => {
    const analyzer = new MockAnalyzer();
    const result = await runPipeline(baseOptions(analyzer));

    expect(result.writtenFiles).toHaveLength(3);
    const sceneFile = path.join(outputDir, "architecture.excalidraw");
    const scene = JSON.parse(fs.readFileSync(sceneFile, "utf8"));
    expect(scene.type).toBe("excalidraw");
    expect(scene.elements.length).toBeGreaterThan(5);

    const svg = fs.readFileSync(path.join(outputDir, "architecture.svg"), "utf8");
    expect(svg).toContain("PostgreSQL");

    const ir = JSON.parse(fs.readFileSync(path.join(outputDir, "architecture.json"), "utf8"));
    expect(ir.nodes).toHaveLength(3);
  });

  it("hits the cache on the second run and honors refresh", async () => {
    const analyzer = new MockAnalyzer();
    await runPipeline(baseOptions(analyzer));
    expect(analyzer.calls).toBe(1);

    const second = await runPipeline(baseOptions(analyzer));
    expect(analyzer.calls).toBe(1);
    expect(second.fromCache).toBe(true);

    await runPipeline({ ...baseOptions(analyzer), refresh: true });
    expect(analyzer.calls).toBe(2);
  });

  it("fails with ScanEmptyError on a project without signals", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "archcli-empty-"));
    fs.writeFileSync(path.join(emptyDir, "notes.txt"), "nothing here");
    try {
      await expect(
        runPipeline({ ...baseOptions(new MockAnalyzer()), rootDir: emptyDir }),
      ).rejects.toThrow(/No architectural signals/);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
