import { getNodePath, parseTree, type Node, type ParseError } from "jsonc-parser";
import type { EdgeData, GraphData, NodeData, NodeRow } from "./types";
import { calculateNodeSize } from "./utils/calculateNodeSize";

// Palette for port-connected edges — distinct, readable on both light/dark backgrounds
const PORT_COLORS = [
  "#60a5fa", // blue
  "#34d399", // emerald
  "#f97316", // orange
  "#a78bfa", // violet
  "#f472b6", // pink
  "#facc15", // yellow
  "#2dd4bf", // teal
  "#fb923c", // orange-light
  "#818cf8", // indigo
  "#4ade80", // green
] as const;

export interface ParseGraphResult extends GraphData {
  errors: ParseError[];
}

export const parseGraph = (json: string): ParseGraphResult => {
  const parseErrors: ParseError[] = [];
  const jsonTree = parseTree(json, parseErrors);

  if (!jsonTree) {
    return {
      nodes: [],
      edges: [],
      errors: parseErrors,
    };
  }

  const nodes: NodeData[] = [];
  const edges: EdgeData[] = [];
  let nodeId = 1;
  let edgeId = 1;
  let portColorIndex = 0;

  function traverse(node: Node, parentId?: string): string | undefined {
    const id = String(nodeId++);
    const text: NodeRow[] = [];

    if (parentId !== undefined && node.parent?.type === "array") {
      edges.push({
        id: String(edgeId++),
        from: parentId,
        to: id,
        text: "",
      });
    }

    const isArray = node.type === "array";
    const isRootArray = !node.parent || node.parent.type === "array";

    if (isArray && isRootArray) {
      const { width, height } = calculateNodeSize(`[${node.children?.length ?? "0"} items]`);

      nodes.push({
        id,
        text: [
          {
            key: null,
            value: `[${node.children?.length ?? 0} items]`,
            type: "array",
            childrenCount: node.children?.length,
          },
        ],
        width,
        height,
        path: [],
      });

      node.children?.forEach(child => {
        traverse(child, id);
      });

      return id;
    }

    node.children?.forEach(child => {
      if (!child.children || !child.children[1]) {
        traverse(child, id);
        return;
      }

      const key = child.children[0].value?.toString() ?? null;
      const valueNode = child.children[1];
      const type = valueNode.type;

      if (type === "array") {
        const targetIds: string[] = [];

        valueNode.children?.forEach(arrayChild => {
          const arrayChildId = traverse(arrayChild, undefined);
          if (arrayChildId) targetIds.push(arrayChildId);
        });

        const portId = `${id}-port-${key}`;
        const portColor = PORT_COLORS[portColorIndex++ % PORT_COLORS.length];

        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
          to: targetIds.length > 0 ? targetIds : undefined,
          childrenCount: valueNode.children?.length,
          portId: targetIds.length > 0 ? portId : undefined,
          portColor: targetIds.length > 0 ? portColor : undefined,
        });

        targetIds.forEach(targetId => {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: targetId,
            text: key,
            fromPort: portId,
            color: portColor,
          });
        });
      } else if (type === "object") {
        const objectNodeId = traverse(valueNode, id);

        const portId = `${id}-port-${key}`;
        const portColor = PORT_COLORS[portColorIndex++ % PORT_COLORS.length];

        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
          childrenCount: Object.keys(valueNode.children ?? {}).length,
          ...(objectNodeId && { to: [objectNodeId], portId, portColor }),
        });

        if (objectNodeId) {
          edges.push({
            id: String(edgeId++),
            from: id,
            to: objectNodeId,
            text: key,
            fromPort: portId,
            color: portColor,
          });
        }
      } else {
        text.push({
          key,
          value: valueNode.value as NodeRow["value"],
          type,
        });
      }
    });

    if (node.parent?.type === "array" && node.type === "object" && node.children?.length === 0) {
      text.push({
        key: null,
        value: "{0 keys}",
        type: "object",
        childrenCount: 0,
      });
    }

    const appendParentKey = () => {
      const getParentKey = (targetNode: Node) => {
        const path = getNodePath(targetNode);
        return path?.pop()?.toString();
      };

      if (!node.parent) {
        return { parentKey: getParentKey(node), parentType: node.type };
      }

      if (node.parent.type === "array") {
        return { parentKey: getParentKey(node.parent), parentType: "array" };
      }

      if (node.parent.type === "property") {
        return { parentKey: getParentKey(node), parentType: "object" };
      }

      return {
        parentKey: getParentKey(node),
        parentType: node.parent.type.replace("property", "object"),
      };
    };

    if (text.length === 0) {
      if (typeof node.value === "undefined") return undefined;

      const { width, height } = calculateNodeSize(node.value as string | number);

      nodes.push({
        id,
        text: [
          {
            key: null,
            value: node.value as NodeRow["value"],
            type: node.type,
          },
        ],
        width,
        height,
        path: getNodePath(node),
        ...appendParentKey(),
      });
    } else {
      let displayText: string | [string, string][];

      const visibleText = text.filter(row => row.value !== null);

      if (visibleText.some(row => row.key !== null)) {
        displayText = visibleText.map(row => {
          const keyStr = row.key === null ? "" : row.key;

          if (row.type === "object") return [keyStr, `{${row.childrenCount ?? 0} keys}`];
          if (row.type === "array") return [keyStr, `[${row.childrenCount ?? 0} items]`];

          return [keyStr, `${row.value}`];
        });
      } else {
        displayText = `${visibleText[0]?.value ?? ""}`;
      }

      const { width, height } = calculateNodeSize(displayText);

      const ROW_HEIGHT = 30;
      const portsWithRowIndex: Array<{ id: string; rowIndex: number }> = [];
      visibleText.forEach((row, rowIndex) => {
        if (row.portId) portsWithRowIndex.push({ id: row.portId, rowIndex });
      });

      const ports = portsWithRowIndex.map(({ id: portId, rowIndex }) => ({
        id: portId,
        side: "EAST" as const,
        width: 1,
        height: 1,
        x: width,
        y: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
      }));

      nodes.push({
        id,
        text: visibleText,
        width,
        height,
        ...(ports.length > 0 && {
          ports,
          layoutOptions: { portConstraints: "FIXED_POS" },
        }),
        path: getNodePath(node),
        ...appendParentKey(),
      });
    }

    return id;
  }

  traverse(jsonTree);

  return {
    nodes,
    edges,
    errors: parseErrors,
  };
};
