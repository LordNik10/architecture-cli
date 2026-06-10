import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArchitectureGraphSchema } from "../src/ir/schema.js";
import { normalizeGraph } from "../src/ir/normalize.js";
import { layoutGraph } from "../src/layout/elk.js";
import { renderExcalidraw, validateScene } from "../src/render/excalidraw.js";
import { renderSvg } from "../src/render/svg.js";

const sampleIr = () =>
  normalizeGraph(
    ArchitectureGraphSchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(__dirname, "fixtures", "sample-ir.json"), "utf8"),
      ),
    ),
  );

describe("layoutGraph", () => {
  it("produces finite, non-overlapping sibling leaves contained in their groups", async () => {
    const positioned = await layoutGraph(sampleIr());

    for (const p of positioned.nodes) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }

    const byId = new Map(positioned.nodes.map((p) => [p.node.id, p]));
    // children fully inside their parent group
    for (const p of positioned.nodes) {
      if (p.node.parentId === null) continue;
      const parent = byId.get(p.node.parentId)!;
      expect(p.x).toBeGreaterThanOrEqual(parent.x);
      expect(p.y).toBeGreaterThanOrEqual(parent.y);
      expect(p.x + p.width).toBeLessThanOrEqual(parent.x + parent.width + 0.5);
      expect(p.y + p.height).toBeLessThanOrEqual(parent.y + parent.height + 0.5);
    }

    // leaf nodes never overlap each other
    const leaves = positioned.nodes.filter((p) => p.node.kind !== "group");
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlap, `${a.node.id} overlaps ${b.node.id}`).toBe(false);
      }
    }
  });
});

describe("renderExcalidraw", () => {
  it("produces a valid scene with reciprocal bindings", async () => {
    const scene = renderExcalidraw(await layoutGraph(sampleIr()));
    expect(() => validateScene(scene)).not.toThrow();
    expect(scene.type).toBe("excalidraw");
    expect(scene.elements.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same input", async () => {
    const a = renderExcalidraw(await layoutGraph(sampleIr()));
    const b = renderExcalidraw(await layoutGraph(sampleIr()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("groups members with their layer for drag-together", async () => {
    const scene = renderExcalidraw(await layoutGraph(sampleIr()));
    const clientRect = scene.elements.find((e) => e.id === "n-client-app-1")!;
    expect(clientRect.groupIds).toContain("eg-client-layer");
    const layerRect = scene.elements.find((e) => e.id === "n-client-layer")!;
    expect(layerRect.groupIds).toContain("eg-client-layer");
  });

  it("emits arrows bound on both endpoints", async () => {
    const scene = renderExcalidraw(await layoutGraph(sampleIr()));
    const arrow = scene.elements.find((e) => e.id === "e-e1")!;
    expect((arrow["startBinding"] as { elementId: string }).elementId).toBe("n-client-app-1");
    expect((arrow["endBinding"] as { elementId: string }).elementId).toBe("n-web-api");
  });

  it("validateScene rejects a broken reciprocal binding", async () => {
    const scene = renderExcalidraw(await layoutGraph(sampleIr()));
    const rect = scene.elements.find((e) => e.id === "n-web-api")!;
    rect.boundElements = [];
    expect(() => validateScene(scene)).toThrow(/reciprocal/);
  });
});

describe("renderSvg", () => {
  it("renders well-formed SVG containing all node labels", async () => {
    const positioned = await layoutGraph(sampleIr());
    const svg = renderSvg(positioned);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toMatch(/<\/svg>$/);
    for (const p of positioned.nodes) {
      expect(svg).toContain(p.node.label);
    }
  });
});
