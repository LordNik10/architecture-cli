import type { NodeKind } from "../ir/schema.js";
import type { PositionedGraph } from "../layout/types.js";

const KIND_COLORS: Record<NodeKind, { stroke: string; fill: string }> = {
  client: { stroke: "#e03131", fill: "#ffc9c9" },
  service: { stroke: "#2f9e44", fill: "#b2f2bb" },
  api: { stroke: "#f08c00", fill: "#ffec99" },
  database: { stroke: "#1971c2", fill: "#a5d8ff" },
  queue: { stroke: "#e8590c", fill: "#ffd8a8" },
  cache: { stroke: "#9c36b5", fill: "#eebefa" },
  external: { stroke: "#495057", fill: "#e9ecef" },
  group: { stroke: "#868e96", fill: "none" },
};

const MARGIN = 40;
const FONT = "ui-sans-serif, system-ui, sans-serif";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Shorten the segment at both ends so arrows stop at node borders. */
function clip(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const sx = dx !== 0 ? rect.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? rect.height / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy, 1);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

export function renderSvg(graph: PositionedGraph): string {
  const width = Math.ceil(graph.width + MARGIN * 2);
  const height = Math.ceil(graph.height + MARGIN * 2 + 50);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1e1e1e"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${MARGIN}" y="28" font-size="20" font-weight="bold" fill="#1e1e1e">${esc(graph.title)}</text>`,
  );

  const offsetY = MARGIN + 50;
  const positioned = new Map(graph.nodes.map((p) => [p.node.id, p]));

  for (const p of graph.nodes) {
    const { stroke, fill } = KIND_COLORS[p.node.kind];
    const x = p.x + MARGIN;
    const y = p.y + offsetY;
    const isGroup = p.node.kind === "group";
    parts.push(
      `<rect x="${x}" y="${y}" width="${p.width}" height="${p.height}" rx="${isGroup ? 4 : 10}" fill="${fill}" stroke="${stroke}" stroke-width="${isGroup ? 1.5 : 2}"${isGroup ? ' stroke-dasharray="8 5"' : ""}/>`,
    );
    if (isGroup) {
      parts.push(
        `<text x="${x + 14}" y="${y + 26}" font-size="15" font-weight="bold" fill="${stroke}">${esc(p.node.label)}</text>`,
      );
    } else {
      const cx = x + p.width / 2;
      const cy = y + p.height / 2;
      if (p.node.sublabel) {
        parts.push(
          `<text x="${cx}" y="${cy - 3}" font-size="14" font-weight="600" text-anchor="middle" fill="#1e1e1e">${esc(p.node.label)}</text>`,
          `<text x="${cx}" y="${cy + 15}" font-size="11" text-anchor="middle" fill="#495057">${esc(p.node.sublabel)}</text>`,
        );
      } else {
        parts.push(
          `<text x="${cx}" y="${cy + 5}" font-size="14" font-weight="600" text-anchor="middle" fill="#1e1e1e">${esc(p.node.label)}</text>`,
        );
      }
    }
  }

  for (const pe of graph.edges) {
    const fromRect = positioned.get(pe.edge.from)!;
    const toRect = positioned.get(pe.edge.to)!;
    const from = { x: pe.fromCenter.x + MARGIN, y: pe.fromCenter.y + offsetY };
    const to = { x: pe.toCenter.x + MARGIN, y: pe.toCenter.y + offsetY };
    const start = clip(from, to, {
      ...fromRect,
      x: fromRect.x + MARGIN,
      y: fromRect.y + offsetY,
    });
    const end = clip(to, from, {
      ...toRect,
      x: toRect.x + MARGIN,
      y: toRect.y + offsetY,
    });
    const markers = `marker-end="url(#arrow)"${pe.edge.bidirectional ? ' marker-start="url(#arrow)"' : ""}`;
    parts.push(
      `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#1e1e1e" stroke-width="1.8" ${markers}/>`,
    );
    if (pe.edge.label) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      const w = pe.edge.label.length * 6.6 + 8;
      parts.push(
        `<rect x="${mx - w / 2}" y="${my - 10}" width="${w}" height="16" rx="4" fill="#ffffff" opacity="0.9"/>`,
        `<text x="${mx}" y="${my + 3}" font-size="11" text-anchor="middle" fill="#495057">${esc(pe.edge.label)}</text>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}

/** PNG via optional native dep; returns null when @resvg/resvg-js is unavailable. */
export async function renderPng(svg: string): Promise<Buffer | null> {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: 2 } });
    return Buffer.from(resvg.render().asPng());
  } catch {
    return null;
  }
}
