import { describe, expect, it } from "vitest";
import { normalizeGraph } from "../src/ir/normalize.js";
import type { ArchitectureGraph, IrNode } from "../src/ir/schema.js";

const node = (overrides: Partial<IrNode> & Pick<IrNode, "id" | "kind">): IrNode => ({
  label: overrides.id,
  sublabel: null,
  parentId: null,
  description: null,
  ...overrides,
});

const graph = (nodes: IrNode[], edges: ArchitectureGraph["edges"]): ArchitectureGraph => ({
  title: "t",
  summary: "s",
  nodes,
  edges,
});

describe("normalizeGraph", () => {
  it("drops edges referencing missing nodes and self-edges", () => {
    const g = normalizeGraph(
      graph(
        [node({ id: "a", kind: "service" }), node({ id: "b", kind: "service" })],
        [
          { id: "e1", from: "a", to: "b", label: null, bidirectional: false },
          { id: "e2", from: "a", to: "ghost", label: null, bidirectional: false },
          { id: "e3", from: "a", to: "a", label: null, bidirectional: false },
        ],
      ),
    );
    expect(g.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("nulls parentId pointing to non-group or missing nodes", () => {
    const g = normalizeGraph(
      graph(
        [
          node({ id: "svc", kind: "service", parentId: "not-a-group" }),
          node({ id: "not-a-group", kind: "service" }),
          node({ id: "orphan", kind: "service", parentId: "missing" }),
        ],
        [],
      ),
    );
    expect(g.nodes.every((n) => n.parentId === null)).toBe(true);
  });

  it("breaks parentId cycles", () => {
    const g = normalizeGraph(
      graph(
        [
          node({ id: "g1", kind: "group", parentId: "g2" }),
          node({ id: "g2", kind: "group", parentId: "g1" }),
        ],
        [],
      ),
    );
    const parents = g.nodes.map((n) => n.parentId);
    expect(parents).toContain(null);
  });

  it("de-duplicates node ids", () => {
    const g = normalizeGraph(
      graph(
        [node({ id: "a", kind: "service" }), node({ id: "a", kind: "database" })],
        [],
      ),
    );
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(2);
  });
});
