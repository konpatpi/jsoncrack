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
};

const isQueryRoot = (value: unknown): value is QueryRoot => {
  return (
    typeof value === "object" &&
    value !== null &&
    "querySelector" in value &&
    typeof (value as QueryRoot).querySelector === "function"
  );
};

const CustomEdgeBase = ({ viewPort, edgeTargetById, hostElement, ...props }: CustomEdgeProps) => {
  const [hovered, setHovered] = React.useState(false);
  const edgeData = props.properties as EdgeData | undefined;
  const edgeId = edgeData?.id;
  const edgeColor = edgeData?.color;
  const portY = edgeData?.portY;

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

  // Reaflow 5.4.1 puts port x/y in ELK's `properties` field instead of top-level,
  // so ELK ignores them and places all ports at y=0 (top of node).
  // We correct this by shifting startPoint.y (and the first bend point if it matches)
  // to the actual show/hide button position stored in portY.
  const correctedSections = React.useMemo(() => {
    if (portY === undefined || !props.sections?.length) return props.sections;

    return props.sections.map((section, i) => {
      if (i !== 0 || !section.startPoint) return section;

      const originalY = section.startPoint.y;
      const correctedY = originalY + portY;

      // Fix bend points: the first bend point of an orthogonal edge from an EAST port
      // has the same y as startPoint (horizontal first segment). Update it to match.
      const rawBends = section.bendPoints as unknown as { x: number; y: number }[] | undefined;
      const newBendPoints = Array.isArray(rawBends)
        ? rawBends.map((bp, j) =>
            j === 0 && Math.abs(bp.y - originalY) < 1
              ? { ...bp, y: correctedY }
              : bp
          )
        : rawBends;

      return {
        ...section,
        startPoint: { ...section.startPoint, y: correctedY },
        bendPoints: newBendPoints as typeof section.bendPoints,
      };
    });
  }, [props.sections, portY]);

  return (
    <Edge
      containerClassName={`edge-${props.id}`}
      onClick={handleClick}
      onEnter={() => setHovered(true)}
      onLeave={() => setHovered(false)}
      style={{
        stroke: hovered ? "#ffffff" : (edgeColor ?? "var(--edge-stroke)"),
        strokeWidth: hovered ? 2 : 1.5,
        opacity: hovered ? 1 : 0.85,
      }}
      {...props}
      sections={correctedSections as typeof props.sections}
    />
  );
};

export const CustomEdge = React.memo(CustomEdgeBase);
