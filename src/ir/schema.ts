import { z } from "zod";

export const NodeKindSchema = z.enum([
  "client",
  "service",
  "api",
  "database",
  "queue",
  "cache",
  "external",
  "group",
]);

export const IrNodeSchema = z.object({
  id: z
    .string()
    .describe("kebab-case unique id, e.g. 'orders-service'"),
  kind: NodeKindSchema,
  label: z.string().describe("Short display name, max ~30 chars"),
  sublabel: z
    .string()
    .nullable()
    .describe("Tech detail, e.g. 'NestJS', 'PostgreSQL 16', or null"),
  parentId: z
    .string()
    .nullable()
    .describe("id of a 'group' node this node sits inside, or null"),
  description: z
    .string()
    .nullable()
    .describe("One short sentence describing the component's role, or null"),
});

export const IrEdgeSchema = z.object({
  id: z.string().describe("unique edge id, e.g. 'e1'"),
  from: z.string().describe("source node id"),
  to: z.string().describe("target node id"),
  label: z
    .string()
    .nullable()
    .describe("e.g. 'REST', 'gRPC', 'reads/writes', 'publishes', or null"),
  bidirectional: z.boolean(),
});

export const ArchitectureGraphSchema = z.object({
  title: z.string().describe("Project/system name"),
  summary: z.string().describe("2-3 sentence architecture summary"),
  nodes: z.array(IrNodeSchema),
  edges: z.array(IrEdgeSchema),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type IrNode = z.infer<typeof IrNodeSchema>;
export type IrEdge = z.infer<typeof IrEdgeSchema>;
export type ArchitectureGraph = z.infer<typeof ArchitectureGraphSchema>;
