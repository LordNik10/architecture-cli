import type { NodeKind } from "../ir/schema.js";
import type { PositionedGraph, PositionedNode } from "../layout/types.js";

/**
 * Minimal Excalidraw element shape. We generate scene JSON directly instead of
 * depending on @excalidraw/excalidraw types at runtime.
 */
export interface ExcalidrawElement {
  id: string;
  type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: "solid" | "hachure" | "cross-hatch";
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: { id: string; type: "text" | "arrow" }[] | null;
  updated: number;
  link: null;
  locked: boolean;
  [key: string]: unknown;
}

export interface ExcalidrawScene {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: ExcalidrawElement[];
  appState: { viewBackgroundColor: string; gridSize: null };
  files: Record<string, never>;
}

interface KindStyle {
  stroke: string;
  background: string;
}

const KIND_STYLES: Record<NodeKind, KindStyle> = {
  client: { stroke: "#e03131", background: "#ffc9c9" },
  service: { stroke: "#2f9e44", background: "#b2f2bb" },
  api: { stroke: "#f08c00", background: "#ffec99" },
  database: { stroke: "#1971c2", background: "#a5d8ff" },
  queue: { stroke: "#e8590c", background: "#ffd8a8" },
  cache: { stroke: "#9c36b5", background: "#eebefa" },
  external: { stroke: "#495057", background: "#e9ecef" },
  group: { stroke: "#868e96", background: "transparent" },
};

/** Deterministic 32-bit hash (FNV-1a) so the same IR yields the same scene. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

function baseElement(
  id: string,
  overrides: Partial<ExcalidrawElement> & Pick<ExcalidrawElement, "type" | "x" | "y" | "width" | "height">,
): ExcalidrawElement {
  return {
    id,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: hash32(id),
    version: 1,
    versionNonce: hash32(`${id}:nonce`),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...overrides,
  };
}

/**
 * Clip the segment from a rectangle's center toward an outside point at the
 * rectangle border, pushed out by `gap`.
 */
function clipToRect(
  rect: { x: number; y: number; width: number; height: number },
  toward: { x: number; y: number },
  gap: number,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? rect.width / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? rect.height / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);
  const len = Math.hypot(dx, dy);
  const tGap = t + gap / len;
  return { x: cx + dx * tGap, y: cy + dy * tGap };
}

const FONT_FAMILY_CODE = 3; // Excalidraw "code" font keeps width estimates honest
const LABEL_FONT_SIZE = 16;
const GROUP_LABEL_FONT_SIZE = 16;
const EDGE_LABEL_FONT_SIZE = 12;
const LINE_HEIGHT = 1.25;

function textElement(
  id: string,
  text: string,
  opts: {
    x: number;
    y: number;
    fontSize: number;
    containerId: string | null;
    strokeColor?: string;
    groupIds?: string[];
  },
): ExcalidrawElement {
  const lines = text.split("\n");
  const widest = Math.max(...lines.map((l) => l.length));
  const width = widest * opts.fontSize * 0.6;
  const height = lines.length * opts.fontSize * LINE_HEIGHT;
  return baseElement(id, {
    type: "text",
    x: opts.x,
    y: opts.y,
    width,
    height,
    strokeColor: opts.strokeColor ?? "#1e1e1e",
    groupIds: opts.groupIds ?? [],
    fontSize: opts.fontSize,
    fontFamily: FONT_FAMILY_CODE,
    text,
    textAlign: opts.containerId ? "center" : "left",
    verticalAlign: opts.containerId ? "middle" : "top",
    containerId: opts.containerId,
    originalText: text,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
  });
}

export function renderExcalidraw(graph: PositionedGraph): ExcalidrawScene {
  const elements: ExcalidrawElement[] = [];
  const shapeById = new Map<string, ExcalidrawElement>();

  // Each node living inside group G gets G's excalidraw groupId (and its
  // ancestors'), so dragging a layer on excalidraw.com moves its members.
  const groupIdsFor = (n: PositionedNode): string[] => {
    const ids: string[] = [];
    let parentId = n.node.parentId;
    const byId = new Map(graph.nodes.map((p) => [p.node.id, p]));
    while (parentId !== null) {
      ids.push(`eg-${parentId}`);
      parentId = byId.get(parentId)?.node.parentId ?? null;
    }
    if (n.node.kind === "group") ids.unshift(`eg-${n.node.id}`);
    return ids;
  };

  // graph.nodes is sorted groups-first (ascending depth) → correct z-order.
  for (const p of graph.nodes) {
    const style = KIND_STYLES[p.node.kind];
    const rectId = `n-${p.node.id}`;
    const isGroup = p.node.kind === "group";
    const rect = baseElement(rectId, {
      type: "rectangle",
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      strokeColor: style.stroke,
      backgroundColor: style.background,
      strokeStyle: isGroup ? "dashed" : "solid",
      strokeWidth: isGroup ? 1 : 2,
      roundness: isGroup ? null : { type: 3 },
      groupIds: groupIdsFor(p),
      boundElements: [],
    });
    elements.push(rect);
    shapeById.set(p.node.id, rect);

    if (isGroup) {
      // Standalone label at the top-left, inside the padding headroom.
      elements.push(
        textElement(`t-${p.node.id}`, p.node.label, {
          x: p.x + 14,
          y: p.y + 12,
          fontSize: GROUP_LABEL_FONT_SIZE,
          containerId: null,
          strokeColor: style.stroke,
          groupIds: groupIdsFor(p),
        }),
      );
    } else {
      const labelText = p.node.sublabel
        ? `${p.node.label}\n${p.node.sublabel}`
        : p.node.label;
      const textId = `t-${p.node.id}`;
      const label = textElement(textId, labelText, {
        x: p.x + 10,
        y: p.y + p.height / 2 - 12,
        fontSize: LABEL_FONT_SIZE,
        containerId: rectId,
        groupIds: groupIdsFor(p),
      });
      elements.push(label);
      rect.boundElements!.push({ id: textId, type: "text" });
    }
  }

  for (const pe of graph.edges) {
    const fromShape = shapeById.get(pe.edge.from);
    const toShape = shapeById.get(pe.edge.to);
    if (!fromShape || !toShape) continue;

    const gap = 6;
    const start = clipToRect(fromShape, pe.toCenter, gap);
    const end = clipToRect(toShape, pe.fromCenter, gap);
    const arrowId = `e-${pe.edge.id}`;

    const arrow = baseElement(arrowId, {
      type: "arrow",
      x: start.x,
      y: start.y,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      strokeColor: "#1e1e1e",
      points: [
        [0, 0],
        [end.x - start.x, end.y - start.y],
      ],
      lastCommittedPoint: null,
      startBinding: { elementId: fromShape.id, focus: 0, gap },
      endBinding: { elementId: toShape.id, focus: 0, gap },
      startArrowhead: pe.edge.bidirectional ? "arrow" : null,
      endArrowhead: "arrow",
      elbowed: false,
      boundElements: [],
    });
    elements.push(arrow);

    // Reciprocal references: without these, bindings break when a node is
    // dragged on excalidraw.com.
    fromShape.boundElements!.push({ id: arrowId, type: "arrow" });
    toShape.boundElements!.push({ id: arrowId, type: "arrow" });

    if (pe.edge.label) {
      const labelId = `te-${pe.edge.id}`;
      const label = textElement(labelId, pe.edge.label, {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        fontSize: EDGE_LABEL_FONT_SIZE,
        containerId: arrowId,
        strokeColor: "#495057",
      });
      elements.push(label);
      (arrow.boundElements as { id: string; type: string }[]).push({
        id: labelId,
        type: "text",
      });
    }
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "llm-arch-diagram",
    elements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
}

/** Assert scene invariants. Throws with a descriptive message on violation. */
export function validateScene(scene: ExcalidrawScene): void {
  const byId = new Map(scene.elements.map((e) => [e.id, e]));
  if (byId.size !== scene.elements.length) {
    throw new Error("scene contains duplicate element ids");
  }
  for (const el of scene.elements) {
    for (const bound of el.boundElements ?? []) {
      const target = byId.get(bound.id);
      if (!target) throw new Error(`${el.id}: boundElements references missing ${bound.id}`);
    }
    const containerId = el["containerId"] as string | null | undefined;
    if (containerId) {
      const container = byId.get(containerId);
      if (!container) throw new Error(`${el.id}: containerId ${containerId} missing`);
      const registered = (container.boundElements ?? []).some((b) => b.id === el.id);
      if (!registered) {
        throw new Error(`${el.id}: container ${containerId} lacks reciprocal boundElements entry`);
      }
    }
    for (const key of ["startBinding", "endBinding"] as const) {
      const binding = el[key] as { elementId: string } | null | undefined;
      if (binding) {
        const target = byId.get(binding.elementId);
        if (!target) throw new Error(`${el.id}: ${key} references missing ${binding.elementId}`);
        const registered = (target.boundElements ?? []).some((b) => b.id === el.id);
        if (!registered) {
          throw new Error(`${el.id}: ${key} target ${binding.elementId} lacks reciprocal boundElements entry`);
        }
      }
    }
  }
}
