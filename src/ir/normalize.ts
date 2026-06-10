import type { ArchitectureGraph, IrNode } from "./schema.js";

/**
 * Repair structural problems an LLM-produced graph may have, so the layout
 * and renderers can rely on invariants:
 * - node ids unique (duplicates get a numeric suffix)
 * - parentId points to an existing `group` node (otherwise nulled)
 * - no parentId cycles
 * - edges reference existing nodes (otherwise dropped)
 * - no self-edges
 * - edge ids unique
 */
export function normalizeGraph(graph: ArchitectureGraph): ArchitectureGraph {
  const nodes: IrNode[] = [];
  const seenIds = new Set<string>();

  for (const node of graph.nodes) {
    let id = node.id;
    let n = 2;
    while (seenIds.has(id)) id = `${node.id}-${n++}`;
    seenIds.add(id);
    nodes.push({ ...node, id });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    if (node.parentId !== null) {
      const parent = byId.get(node.parentId);
      if (!parent || parent.kind !== "group" || parent.id === node.id) {
        node.parentId = null;
      }
    }
  }

  // Break parentId cycles by detaching the node that closes the loop.
  for (const node of nodes) {
    const visited = new Set<string>([node.id]);
    let current = node;
    while (current.parentId !== null) {
      if (visited.has(current.parentId)) {
        current.parentId = null;
        break;
      }
      visited.add(current.parentId);
      current = byId.get(current.parentId)!;
    }
  }

  const seenEdgeIds = new Set<string>();
  const edges = graph.edges
    .filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to)
    .map((e) => {
      let id = e.id;
      let n = 2;
      while (seenEdgeIds.has(id)) id = `${e.id}-${n++}`;
      seenEdgeIds.add(id);
      return { ...e, id };
    });

  return { ...graph, nodes, edges };
}
