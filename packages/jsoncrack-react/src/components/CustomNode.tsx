import React from "react";
import type { NodeProps } from "reaflow";
import { Node } from "reaflow";
import type { NodeData } from "../types";
import { ObjectNode } from "./ObjectNode";
import { TextNode } from "./TextNode";

const ROW_HEIGHT = 30;
const BTN_R = 8;

type CustomNodeProps = NodeProps<NodeData> & {
  onNodeClick?: (node: NodeData) => void;
  collapsedFieldKeys?: Set<string>;
  onToggleField?: (nodeId: string, fieldKey: string) => void;
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

const CustomNodeBase = ({ onNodeClick, collapsedFieldKeys, onToggleField, ...nodeProps }: CustomNodeProps) => {
  const handleNodeClick = React.useCallback(
    (_: React.MouseEvent<SVGGElement, MouseEvent>, data: NodeData) => {
      onNodeClick?.(data);
    },
    [onNodeClick]
  );

  const nodeId = (nodeProps.properties as NodeData).id;

  const handleToggleField = React.useCallback(
    (fieldKey: string) => {
      onToggleField?.(nodeId, fieldKey);
    },
    [nodeId, onToggleField]
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
      {({ node, x, y, width }) => {
        const nodeData = nodeProps.properties as NodeData;
        const hasKey = nodeData.text[0]?.key;

        if (!hasKey) {
          return (
            <g ref={innerRef}>
              <TextNode node={nodeData} x={x} y={y} />
            </g>
          );
        }

        // SVG collapse buttons — siblings of foreignObject, in SVG space
        // x = width (right border center), y = row_center
        const buttons = onToggleField
          ? nodeData.text.map((row, rowIndex) => {
              if (!row.key || !row.to?.length) return null;
              const cy = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
              const isCollapsed = collapsedFieldKeys?.has(row.key) ?? false;
              return (
                <g
                  key={`btn-${rowIndex}`}
                  transform={`translate(${width},${cy})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleField(row.key!);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    r={BTN_R}
                    fill={fillStyle}
                    stroke={row.portColor ?? strokeStyle}
                    strokeWidth="2"
                  />
                  {/* − line */}
                  <line
                    x1={-(BTN_R - 3)} y1="0"
                    x2={BTN_R - 3} y2="0"
                    stroke={row.portColor ?? "var(--node-key)"}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  {/* + vertical line (only when collapsed) */}
                  {isCollapsed && (
                    <line
                      x1="0" y1={-(BTN_R - 3)}
                      x2="0" y2={BTN_R - 3}
                      stroke={row.portColor ?? "var(--node-key)"}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })
          : null;

        return (
          <g ref={innerRef}>
            <ObjectNode
              node={node as NodeData}
              x={x}
              y={y}
              layoutWidth={width}
            />
            {buttons}
          </g>
        );
      }}
    </Node>
  );
};

export const CustomNode = React.memo(CustomNodeBase);

