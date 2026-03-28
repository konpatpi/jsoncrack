import React from "react";
import type { NodeProps } from "reaflow";
import { Node } from "reaflow";
import type { NodeData } from "../types";
import { ObjectNode } from "./ObjectNode";
import { TextNode } from "./TextNode";

type CustomNodeProps = NodeProps<NodeData> & {
  onNodeClick?: (node: NodeData) => void;
  onNodeSingleClick?: (node: NodeData) => void;
  highlightedNodeIds?: Set<string>;
  incomingEdgeColor?: string;
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

const CustomNodeBase = ({ onNodeClick, onNodeSingleClick, highlightedNodeIds, incomingEdgeColor, ...nodeProps }: CustomNodeProps) => {
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = React.useRef(0);
  
  const handleNodeClickEvent = React.useCallback(
    (event: React.MouseEvent<SVGGElement, MouseEvent>, data: NodeData) => {
      event.stopPropagation();
      
      clickCountRef.current += 1;
      
      if (clickCountRef.current === 1) {
        // First click - wait to see if there's a second click
        clickTimerRef.current = setTimeout(() => {
          // Single click confirmed
          onNodeSingleClick?.(data);
          clickCountRef.current = 0;
        }, 250);
      } else if (clickCountRef.current === 2) {
        // Double click detected
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        onNodeClick?.(data);
        clickCountRef.current = 0;
      }
    },
    [onNodeClick, onNodeSingleClick]
  );

  React.useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const nodeData = nodeProps.properties as NodeData;
  const isHighlighted = highlightedNodeIds?.has(nodeData.id) ?? false;
  const evalStatus = getEvalStatus(nodeData);

  // Highlight takes precedence over eval status for styling
  const fillStyle = evalStatus ? `var(--eval-${evalStatus}-fill)` : "var(--node-fill)";
  const strokeStyle = isHighlighted 
    ? "#EF4444" 
    : evalStatus 
      ? `var(--eval-${evalStatus}-stroke)` 
      : incomingEdgeColor ?? "var(--node-stroke)";
  const strokeWidth = isHighlighted ? 3 : evalStatus ? 2 : 1;

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

    // Port clickers sit on top of our toggle buttons (same x/y position).
    // Disable their pointer events so our buttons receive cursor & click correctly.
    reaflowG?.querySelectorAll<SVGElement>('[class*="_clicker_1r6fw"]').forEach(el => {
      el.style.pointerEvents = "none";
    });
  });

  return (
    <Node
      {...nodeProps}
      onClick={handleNodeClickEvent as any}
      animated={false}
      label={null as any}
      linkable={false}
      onEnter={event => {
        const rect = (event.currentTarget as SVGGElement).querySelector<SVGRectElement>("rect");
        if (rect) {
          // Don't change stroke on hover if already highlighted
          if (isHighlighted) {
            rect.style.stroke = strokeStyle;
            rect.style.strokeWidth = String(strokeWidth);
          } else {
            rect.style.stroke = evalStatus ? strokeStyle : "#3B82F6";
            rect.style.strokeWidth = evalStatus ? String(strokeWidth) : "2";
          }
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

        return (
          <g ref={innerRef}>
            <ObjectNode node={node as NodeData} x={x} y={y} layoutWidth={width} />
          </g>
        );
      }}
    </Node>
  );
};

export const CustomNode = React.memo(CustomNodeBase);

