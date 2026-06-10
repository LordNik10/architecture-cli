import ElkCtorModule from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api.js";

interface ElkInstance {
  layout(graph: ElkNode): Promise<ElkNode>;
}
// elkjs is CJS; under NodeNext the default import needs an explicit cast.
const ELK = ElkCtorModule as unknown as new () => ElkInstance;
import type { ArchitectureGraph, IrNode } from "../ir/schema.js";
import type {
  LayoutDirection,
  PositionedGraph,
  PositionedNode,
} from "./types.js";

const NODE_HEIGHT = 64;
const SUBLABEL_EXTRA = 18;
const CHAR_WIDTH = 9;
const MIN_WIDTH = 150;

export function leafSize(node: IrNode): { width: number; height: number } {
  const textLen = Math.max(node.label.length, (node.sublabel ?? "").length);
  return {
    width: Math.max(MIN_WIDTH, textLen * CHAR_WIDTH + 48),
    height: NODE_HEIGHT + (node.sublabel ? SUBLABEL_EXTRA : 0),
  };
}

export async function layoutGraph(
  graph: ArchitectureGraph,
  direction: LayoutDirection = "right",
): Promise<PositionedGraph> {
  const childrenOf = new Map<string | null, IrNode[]>();
  for (const node of graph.nodes) {
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }

  const buildElkNode = (node: IrNode): ElkNode => {
    const children = childrenOf.get(node.id) ?? [];
    if (node.kind === "group" && children.length > 0) {
      return {
        id: node.id,
        children: children.map(buildElkNode),
        layoutOptions: {
          // headroom for the group label
          "elk.padding": "[top=56,left=28,bottom=28,right=28]",
        },
      };
    }
    const { width, height } = leafSize(node);
    return { id: node.id, width, height };
  };

  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "down" ? "DOWN" : "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "50",
      "elk.spacing.componentComponent": "70",
    },
    children: (childrenOf.get(null) ?? []).map(buildElkNode),
    edges: graph.edges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  };

  const elk = new ELK();
  const laid = await elk.layout(root);

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const positioned = new Map<string, PositionedNode>();

  const walk = (elkNode: ElkNode, offsetX: number, offsetY: number, depth: number) => {
    for (const child of elkNode.children ?? []) {
      const irNode = byId.get(child.id);
      const x = offsetX + (child.x ?? 0);
      const y = offsetY + (child.y ?? 0);
      if (irNode) {
        positioned.set(child.id, {
          node: irNode,
          x,
          y,
          width: child.width ?? MIN_WIDTH,
          height: child.height ?? NODE_HEIGHT,
          depth,
        });
      }
      walk(child, x, y, depth + 1);
    }
  };
  walk(laid, 0, 0, 0);

  // Groups declared in the IR but empty were laid out as leaves; that's fine.
  const nodes = [...positioned.values()].sort((a, b) => {
    const aGroup = a.node.kind === "group" ? 0 : 1;
    const bGroup = b.node.kind === "group" ? 0 : 1;
    return aGroup - bGroup || a.depth - b.depth;
  });

  const center = (id: string) => {
    const p = positioned.get(id)!;
    return { x: p.x + p.width / 2, y: p.y + p.height / 2 };
  };

  const edges = graph.edges
    .filter((e) => positioned.has(e.from) && positioned.has(e.to))
    .map((edge) => ({
      edge,
      fromCenter: center(edge.from),
      toCenter: center(edge.to),
    }));

  let width = 0;
  let height = 0;
  for (const p of nodes) {
    width = Math.max(width, p.x + p.width);
    height = Math.max(height, p.y + p.height);
  }

  return { title: graph.title, summary: graph.summary, nodes, edges, width, height };
}
