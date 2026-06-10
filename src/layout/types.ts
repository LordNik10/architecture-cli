import type { IrEdge, IrNode } from "../ir/schema.js";

export interface PositionedNode {
  node: IrNode;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Depth in the group hierarchy; 0 = top level. Used for z-ordering. */
  depth: number;
}

export interface PositionedEdge {
  edge: IrEdge;
  /** Absolute center of the source node. */
  fromCenter: { x: number; y: number };
  toCenter: { x: number; y: number };
}

export interface PositionedGraph {
  title: string;
  summary: string;
  /** Group nodes first (ascending depth), then leaf nodes. */
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

export type LayoutDirection = "right" | "down";
