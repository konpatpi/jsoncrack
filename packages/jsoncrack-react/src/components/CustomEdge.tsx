import React from "react";
import type { ViewPort } from "react-zoomable-ui";
import type { EdgeProps } from "reaflow";
import { Edge } from "reaflow";
import type { EdgeData } from "../types";

type QueryRoot = {
  querySelector: (selector: string) => Element | null;
};

type CustomEdgeProps = EdgeProps & {
  viewPort: ViewPort | null;
  edgeTargetById: Map<string, string>;
  hostElement: QueryRoot | null;
  highlightedEdgeIds?: Set<string>;
};

const isQueryRoot = (value: unknown): value is QueryRoot => {
  return (
    typeof value === "object" &&
    value !== null &&
    "querySelector" in value &&
    typeof (value as QueryRoot).querySelector === "function"
  );
};

const CustomEdgeBase = ({ viewPort, edgeTargetById, hostElement, highlightedEdgeIds, ...props }: CustomEdgeProps) => {
  const [hovered, setHovered] = React.useState(false);
  const edgeId = (props.properties as EdgeData | undefined)?.id;
  const edgeColor = (props.properties as EdgeData | undefined)?.color;
  
  const isHighlighted = edgeId ? highlightedEdgeIds?.has(edgeId) ?? false : false;

  const handleClick = React.useCallback(() => {
    const targetNodeId = edgeId ? edgeTargetById.get(edgeId) : undefined;
    if (!targetNodeId) return;

    const queryRoot = isQueryRoot(hostElement)
      ? hostElement
      : typeof document !== "undefined"
        ? document
        : null;
    if (!queryRoot) return;

    const targetNodeDom = queryRoot.querySelector(
      `[data-id$="node-${targetNodeId}"]`
    ) as HTMLElement | null;

    if (targetNodeDom?.parentElement) {
      viewPort?.camera.centerFitElementIntoView(targetNodeDom.parentElement, {
        elementExtraMarginForZoom: 150,
      });
    }
  }, [hostElement, edgeId, edgeTargetById, viewPort]);

  return (
    <Edge
      containerClassName={`edge-${props.id}`}
      onClick={handleClick}
      onEnter={() => setHovered(true)}
      onLeave={() => setHovered(false)}
      style={{
        stroke: isHighlighted 
          ? "#EF4444"
          : (hovered ? "#ffffff" : (edgeColor ?? "var(--edge-stroke)")),
        strokeWidth: isHighlighted ? 2.5 : (hovered ? 2 : 1.5),
        opacity: isHighlighted ? 1 : (hovered ? 1 : 0.85),
      }}
      {...props}
    />
  );
};

export const CustomEdge = React.memo(CustomEdgeBase);
