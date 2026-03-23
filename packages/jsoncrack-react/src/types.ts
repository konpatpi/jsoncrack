import type { JSONPath, Node } from "jsonc-parser";

export interface NodeRow {
  key: string | null;
  value: string | number | null | boolean;
  type: Node["type"];
  childrenCount?: number;
  to?: string[];
  portId?: string;
  portColor?: string;
}

export interface NodeData {
  id: string;
  text: Array<NodeRow>;
  width: number;
  height: number;
  ports?: Array<{ id: string; side: "EAST" | "WEST"; width: number; height: number; hidden?: boolean; index?: number; x?: number; y?: number }>;
  path?: JSONPath;
  parentKey?: string;
  parentType?: string;
}

export interface EdgeData {
  id: string;
  from: string;
  to: string;
  text: string | null;
  fromPort?: string;
  color?: string;
  /** Y-offset (px) of the source port within the parent node, used to correct ELK's default port placement */
  portY?: number;
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}

export type LayoutDirection = "LEFT" | "RIGHT" | "DOWN" | "UP";

export type CanvasThemeMode = "light" | "dark";
