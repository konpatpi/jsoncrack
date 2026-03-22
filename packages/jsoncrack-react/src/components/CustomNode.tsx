import React from "react";
import type { NodeProps } from "reaflow";
import { Node } from "reaflow";
import type { NodeData } from "../types";
import { ObjectNode } from "./ObjectNode";
import { TextNode } from "./TextNode";

type CustomNodeProps = NodeProps<NodeData> & {
  onNodeClick?: (node: NodeData) => void;
};

function getEvalStatus(
  nodeData: NodeData
): "pass" | "fail" | "error" | null {
  const firstRow = nodeData.text[0];
  if (firstRow?.key) return null; // ObjectNode, not a TextNode
  const textValue = firstRow?.value;
  if (typeof textValue !== "string" || !textValue.startsWith("id: ")) return null;

  if (textValue.includes("\nresult: PASS")) return "pass";
  if (textValue.includes("\nresult: FAIL")) return "fail";
  if (textValue.includes("\nresult: ERROR")) return "error";
  return null;
}

const CustomNodeBase = ({ onNodeClick, ...nodeProps }: CustomNodeProps) => {
  const handleNodeClick = React.useCallback(
    (_: React.MouseEvent<SVGGElement, MouseEvent>, data: NodeData) => {
      onNodeClick?.(data);
    },
    [onNodeClick]
  );

  const evalStatus = getEvalStatus(nodeProps.properties as NodeData);

  const fillStyle = evalStatus ? `var(--eval-${evalStatus}-fill)` : "var(--node-fill)";
  const strokeStyle = evalStatus ? `var(--eval-${evalStatus}-stroke)` : "var(--node-stroke)";
  const strokeWidth = evalStatus ? 2 : 1;

  // innerRef points to our <g> inside reaflow's render.
  // reaflow renders: <g>[our <g>][rect]...</g>
  // So parentNode of innerRef is reaflow's <g>, which contains the <rect>.
  const innerRef = React.useRef<SVGGElement | null>(null);

  React.useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const reaflowG = inner.parentNode as SVGGElement | null;
    const rect = reaflowG?.querySelector<SVGRectElement>("rect");
    if (!rect) return;
    rect.style.fill = fillStyle;
    rect.style.stroke = strokeStyle;
    rect.style.strokeWidth = String(strokeWidth);
  });

  return (
    <Node
      {...nodeProps}
      onClick={handleNodeClick as any}
      animated={false}
      label={null as any}
      onEnter={event => {
        const rect = (event.currentTarget as SVGGElement).querySelector<SVGRectElement>("rect");
        if (rect) {
          rect.style.stroke = evalStatus ? strokeStyle : "#3B82F6";
          rect.style.strokeWidth = evalStatus ? String(strokeWidth) : "2";
        }
      }}
      onLeave={event => {
        const rect = (event.currentTarget as SVGGElement).querySelector<SVGRectElement>("rect");
        if (rect) {
          rect.style.stroke = strokeStyle;
          rect.style.strokeWidth = String(strokeWidth);
        }
      }}
      style={{ fill: fillStyle, stroke: strokeStyle, strokeWidth }}
    >
      {({ node, x, y }) => {
        const hasKey = nodeProps.properties.text[0]?.key;
        if (!hasKey) {
          return (
            <g ref={innerRef}>
              <TextNode node={nodeProps.properties as NodeData} x={x} y={y} />
            </g>
          );
        }
        return (
          <g ref={innerRef}>
            <ObjectNode node={node as NodeData} x={x} y={y} />
          </g>
        );
      }}
    </Node>
  );
};

export const CustomNode = React.memo(CustomNodeBase);

