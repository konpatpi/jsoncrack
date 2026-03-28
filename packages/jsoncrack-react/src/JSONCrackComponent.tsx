"use client";

import React from "react";
import ReactDOM from "react-dom";
import type { ViewPort } from "react-zoomable-ui";
import { Space } from "react-zoomable-ui";
import { Canvas } from "reaflow";
import type { ElkRoot } from "reaflow";
import { useLongPress } from "use-long-press";

const BTN_R = 8;
const BTN_ROW_HEIGHT = 30;
import styles from "./JSONCrackStyles.module.css";
import { Controls } from "./components/Controls";
import { CustomEdge } from "./components/CustomEdge";
import { CustomNode } from "./components/CustomNode";
import { parseGraph } from "./parser";
import { themes } from "./theme";
import type { CanvasThemeMode, EdgeData, GraphData, LayoutDirection, NodeData } from "./types";

const layoutOptions = {
  "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.spacing.edgeLabel": "15",
};

function getDescendants(nodeId: string, allEdges: EdgeData[]): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of allEdges) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visited;
}

const objectJsonCache = new WeakMap<object, string>();

export interface JSONCrackRef {
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (zoomFactor: number) => void;
  centerView: () => void;
  focusFirstNode: () => void;
}

export interface JSONCrackProps {
  json: string | object | unknown[];
  theme?: CanvasThemeMode;
  layoutDirection?: LayoutDirection;
  showControls?: boolean;
  showGrid?: boolean;
  trackpadZoom?: boolean;
  centerOnLayout?: boolean;
  maxRenderableNodes?: number;
  className?: string;
  style?: React.CSSProperties;
  onNodeClick?: (node: NodeData) => void;
  onParse?: (graph: GraphData) => void;
  onParseError?: (error: Error) => void;
  onViewportCreate?: (viewPort: ViewPort) => void;
  renderNodeLimitExceeded?: (nodeCount: number, maxRenderableNodes: number) => React.ReactNode;
}

const toJsonText = (json: JSONCrackProps["json"]): string => {
  if (typeof json === "string") return json;

  if (json && typeof json === "object") {
    const cached = objectJsonCache.get(json);
    if (cached) return cached;

    const serialized = JSON.stringify(json, null, 2);
    objectJsonCache.set(json, serialized);
    return serialized;
  }

  return JSON.stringify(json, null, 2);
};

export const JSONCrack = React.forwardRef<JSONCrackRef, JSONCrackProps>(
  (
    {
      json,
      theme = "dark",
      layoutDirection = "RIGHT",
      showControls = true,
      showGrid = true,
      trackpadZoom = false,
      centerOnLayout = true,
      maxRenderableNodes = 1500,
      className,
      style,
      onNodeClick,
      onParse,
      onParseError,
      onViewportCreate,
      renderNodeLimitExceeded,
    },
    ref
  ) => {
    const themeTokens = themes[theme];
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [viewPort, setViewPort] = React.useState<ViewPort | null>(null);
    const [nodes, setNodes] = React.useState<GraphData["nodes"]>([]);
    const [edges, setEdges] = React.useState<GraphData["edges"]>([]);
    const [loading, setLoading] = React.useState(true);
    const [collapsedFields, setCollapsedFields] = React.useState<Map<string, Set<string>>>(new Map());
    const [aboveSupportedLimit, setAboveSupportedLimit] = React.useState(false);
    const [totalNodes, setTotalNodes] = React.useState(0);
    const [paneWidth, setPaneWidth] = React.useState(2000);
    const [paneHeight, setPaneHeight] = React.useState(2000);
    const [nodeLayoutMap, setNodeLayoutMap] = React.useState<Map<string, { x: number; y: number; width: number }>>(new Map());
    const [btnPortalTarget, setBtnPortalTarget] = React.useState<SVGGElement | null>(null);
    const [shouldFitCanvas, setShouldFitCanvas] = React.useState(true);
    const [highlightedNodeIds, setHighlightedNodeIds] = React.useState<Set<string>>(new Set());
    const [highlightedEdgeIds, setHighlightedEdgeIds] = React.useState<Set<string>>(new Set());
    const hasAutoFittedRef = React.useRef(false);
    const callbacksRef = React.useRef({ onParse, onParseError });
    const onViewportCreateRef = React.useRef(onViewportCreate);
    const toggleStateRef = React.useRef<{ centerX: number; centerY: number; zoomFactor: number } | null>(null);
    const pointerDownPosRef = React.useRef<{ x: number; y: number } | null>(null);
    const lastParsedInputRef = React.useRef<{
      jsonText: string;
      maxRenderableNodes: number;
    } | null>(null);

    React.useEffect(() => {
      callbacksRef.current = { onParse, onParseError };
    }, [onParse, onParseError]);

    React.useEffect(() => {
      onViewportCreateRef.current = onViewportCreate;
    }, [onViewportCreate]);

    React.useEffect(() => {
      hasAutoFittedRef.current = false;
    }, [layoutDirection]);

    const centerView = React.useCallback(() => {
      const nextViewPort = viewPort;
      nextViewPort?.updateContainerSize();

      const canvas = containerRef.current?.querySelector(".jsoncrack-canvas") as HTMLElement | null;
      if (canvas) {
        nextViewPort?.camera?.centerFitElementIntoView(canvas);
      }
    }, [viewPort]);

    const focusFirstNode = React.useCallback(() => {
      const rootNode = containerRef.current?.querySelector("g[id$='node-1']") as HTMLElement | null;
      if (!rootNode) return;

      viewPort?.camera?.centerFitElementIntoView(rootNode, {
        elementExtraMarginForZoom: 100,
      });
    }, [viewPort]);

    const setZoom = React.useCallback(
      (zoomFactor: number) => {
        if (!viewPort) return;
        viewPort.camera?.recenter(viewPort.centerX, viewPort.centerY, zoomFactor);
      },
      [viewPort]
    );

    const zoomIn = React.useCallback(() => {
      if (!viewPort) return;
      viewPort.camera?.recenter(viewPort.centerX, viewPort.centerY, viewPort.zoomFactor + 0.1);
    }, [viewPort]);

    const zoomOut = React.useCallback(() => {
      if (!viewPort) return;
      viewPort.camera?.recenter(viewPort.centerX, viewPort.centerY, viewPort.zoomFactor - 0.1);
    }, [viewPort]);

    React.useImperativeHandle(
      ref,
      () => ({
        zoomIn,
        zoomOut,
        setZoom,
        centerView,
        focusFirstNode,
      }),
      [centerView, focusFirstNode, setZoom, zoomIn, zoomOut]
    );

    React.useEffect(() => {
      try {
        const jsonText = toJsonText(json);
        const lastParsedInput = lastParsedInputRef.current;

        if (
          lastParsedInput &&
          lastParsedInput.jsonText === jsonText &&
          lastParsedInput.maxRenderableNodes === maxRenderableNodes
        ) {
          return;
        }

        setLoading(true);

        const graph = parseGraph(jsonText);

        if (graph.errors.length > 0) {
          callbacksRef.current.onParseError?.(
            new Error(`Failed to parse data (${graph.errors.length} syntax error(s)).`)
          );
        }

        setTotalNodes(graph.nodes.length);

        if (graph.nodes.length > maxRenderableNodes) {
          setAboveSupportedLimit(true);
          setNodes([]);
          setEdges([]);
          setLoading(false);
          lastParsedInputRef.current = {
            jsonText,
            maxRenderableNodes,
          };
          return;
        }

        setAboveSupportedLimit(false);
        setNodes(graph.nodes);
        setEdges(graph.edges);
        callbacksRef.current.onParse?.({
          nodes: graph.nodes,
          edges: graph.edges,
        });
        lastParsedInputRef.current = {
          jsonText,
          maxRenderableNodes,
        };

        if (graph.nodes.length === 0) {
          setLoading(false);
        }
      } catch (error) {
        setNodes([]);
        setEdges([]);
        setLoading(false);
        callbacksRef.current.onParseError?.(
          error instanceof Error ? error : new Error("Unable to parse data.")
        );
      }
    }, [json, maxRenderableNodes]);

    const edgeTargetById = React.useMemo(() => {
      const targetById = new Map<string, string>();

      for (let i = 0; i < edges.length; i += 1) {
        const edge = edges[i];
        targetById.set(edge.id, edge.to);
      }

      return targetById;
    }, [edges]);

    const edgeColorByNodeId = React.useMemo(() => {
      const colorById = new Map<string, string>();
      for (const edge of edges) {
        colorById.set(edge.to, edge.color ?? "var(--edge-stroke)");
      }
      return colorById;
    }, [edges]);

    const parentByNodeId = React.useMemo(() => {
      const map = new Map<string, string>();
      for (const edge of edges) {
        map.set(edge.to, edge.from);
      }
      return map;
    }, [edges]);

    const hiddenNodes = React.useMemo(() => {
      const hidden = new Set<string>();
      for (const [nodeId, fieldKeys] of collapsedFields) {
        for (const fieldKey of fieldKeys) {
          for (const edge of edges) {
            if (edge.from === nodeId && edge.text === fieldKey) {
              hidden.add(edge.to);
              getDescendants(edge.to, edges).forEach(id => hidden.add(id));
            }
          }
        }
      }
      return hidden;
    }, [collapsedFields, edges]);

    const visibleNodes = React.useMemo(
      () => nodes.filter(n => !hiddenNodes.has(n.id)),
      [nodes, hiddenNodes]
    );

    const visibleEdges = React.useMemo(
      () => edges.filter(e => !hiddenNodes.has(e.from) && !hiddenNodes.has(e.to)),
      [edges, hiddenNodes]
    );

    const handleToggleField = React.useCallback((nodeId: string, fieldKey: string) => {
      // Prevent Canvas auto-fit on toggle
      setShouldFitCanvas(false);
      
      // Capture current viewport center before toggling
      if (viewPort) {
        toggleStateRef.current = {
          centerX: viewPort.centerX,
          centerY: viewPort.centerY,
          zoomFactor: viewPort.zoomFactor,
        };
      }
      
      setCollapsedFields(prev => {
        const next = new Map(prev);
        const fields = new Set(next.get(nodeId) ?? []);
        if (fields.has(fieldKey)) {
          fields.delete(fieldKey);
        } else {
          fields.add(fieldKey);
        }
        if (fields.size === 0) next.delete(nodeId);
        else next.set(nodeId, fields);
        return next;
      });
    }, [viewPort]);

    const handleNodeSingleClick = React.useCallback((node: NodeData) => {
      // Check if this node is already highlighted
      const isAlreadyHighlighted = highlightedNodeIds.has(node.id);
      
      // If already highlighted, clear everything (toggle off)
      if (isAlreadyHighlighted) {
        setHighlightedNodeIds(new Set());
        setHighlightedEdgeIds(new Set());
        return;
      }
      
      // Otherwise, highlight path to root (existing logic)
      const pathNodeIds = new Set<string>();
      const pathEdgeIds = new Set<string>();
      
      let currentId: string | undefined = node.id;
      while (currentId) {
        pathNodeIds.add(currentId);
        const parentId = parentByNodeId.get(currentId);
        if (parentId) {
          const connectingEdge = edges.find(e => e.from === parentId && e.to === currentId);
          if (connectingEdge) pathEdgeIds.add(connectingEdge.id);
        }
        currentId = parentId;
      }
      
      setHighlightedNodeIds(pathNodeIds);
      setHighlightedEdgeIds(pathEdgeIds);
    }, [highlightedNodeIds, parentByNodeId, edges]);

    const handleCanvasClick = React.useCallback((event: React.MouseEvent) => {
      // Clear highlight only when clicking on canvas background (not on nodes/edges)
      const target = event.target as HTMLElement;
      
      // Check if click is on a node or its descendants
      const isNodeClick = target.closest('[data-id^="node-"]') !== null;
      
      // Check if click is on an edge or its descendants  
      const isEdgeClick = target.closest('[class*="edge-"]') !== null;
      
      // Only clear if clicking on actual background (not node or edge)
      if (!isNodeClick && !isEdgeClick) {
        setHighlightedNodeIds(new Set());
        setHighlightedEdgeIds(new Set());
      }
    }, []);

    const onLayoutChange = React.useCallback(
      (layout: ElkRoot) => {
        if (!layout.width || !layout.height) {
          setLoading(false);
          return;
        }

        setPaneWidth(layout.width + 50);
        setPaneHeight(layout.height + 50);

        // Build node position map from ELK layout
        if (layout.children?.length) {
          const map = new Map<string, { x: number; y: number; width: number }>();
          for (const child of layout.children as Array<{ id: string; x?: number; y?: number; width?: number }>) {
            map.set(child.id, { x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0 });
          }
          setNodeLayoutMap(map);
        }

        // Move (or create) the button overlay <g> to be the LAST child of the
        // canvas SVG motion group — painted on top of all nodes AND edges.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const motionG = containerRef.current?.querySelector(
              ".jsoncrack-canvas svg > g"
            ) as SVGGElement | null;
            if (!motionG) return;
            let btnG = motionG.querySelector<SVGGElement>("#jsoncrack-btn-layer");
            if (!btnG) {
              btnG = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
              btnG.setAttribute("id", "jsoncrack-btn-layer");
            }
            motionG.appendChild(btnG); // append = move to last = top of z-order
            setBtnPortalTarget(prev => (prev === btnG ? prev : btnG));
          });
        });

        requestAnimationFrame(() => {
          const isFirstAutoFit = !hasAutoFittedRef.current;
          const shouldAutoFit = centerOnLayout && isFirstAutoFit;

          if (shouldAutoFit) {
            centerView();
            hasAutoFittedRef.current = true;
            setShouldFitCanvas(false); // Disable fit after first time
          } else if (toggleStateRef.current && viewPort) {
            // Restore viewport position after toggle to prevent jumping
            const { centerX, centerY, zoomFactor } = toggleStateRef.current;
            viewPort.camera?.recenter(centerX, centerY, zoomFactor);
            toggleStateRef.current = null;
          }

          setLoading(false);
        });
      },
      [centerView, centerOnLayout, viewPort]
    );

    const onLongPress = React.useCallback(() => {
      const canvas = containerRef.current?.querySelector(".jsoncrack-canvas") as HTMLElement | null;
      canvas?.classList.add("dragging");
    }, []);

    const bindLongPress = useLongPress(onLongPress, {
      threshold: 150,
      onFinish: () => {
        const canvas = containerRef.current?.querySelector(
          ".jsoncrack-canvas"
        ) as HTMLElement | null;
        canvas?.classList.remove("dragging");
      },
    });

    const tooLargeContent = renderNodeLimitExceeded?.(totalNodes, maxRenderableNodes);
    const canvasClassName = [styles.canvasWrapper, showGrid ? styles.showGrid : "", className]
      .filter(Boolean)
      .join(" ");
    const canvasStyle = {
      "--bg-color": themeTokens.GRID_BG_COLOR,
      "--line-color-1": themeTokens.GRID_COLOR_PRIMARY,
      "--line-color-2": themeTokens.GRID_COLOR_SECONDARY,
      "--edge-stroke": theme === "dark" ? "#444444" : "#BCBEC0",
      "--node-fill": theme === "dark" ? "#292929" : "#ffffff",
      "--node-stroke": theme === "dark" ? "#424242" : "#BCBEC0",
      "--interactive-normal": themeTokens.INTERACTIVE_NORMAL,
      "--background-node": themeTokens.BACKGROUND_NODE,
      "--node-text": themeTokens.NODE_COLORS.TEXT,
      "--node-key": themeTokens.NODE_COLORS.NODE_KEY,
      "--node-value": themeTokens.NODE_COLORS.NODE_VALUE,
      "--node-integer": themeTokens.NODE_COLORS.INTEGER,
      "--node-null": themeTokens.NODE_COLORS.NULL,
      "--node-bool-true": themeTokens.NODE_COLORS.BOOL.TRUE,
      "--node-bool-false": themeTokens.NODE_COLORS.BOOL.FALSE,
      "--node-child-count": themeTokens.NODE_COLORS.CHILD_COUNT,
      "--node-divider": themeTokens.NODE_COLORS.DIVIDER,
      "--text-positive": themeTokens.TEXT_POSITIVE,
      "--background-modifier-accent": themeTokens.BACKGROUND_MODIFIER_ACCENT,
      "--spinner-track": theme === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(17, 24, 39, 0.2)",
      "--spinner-head": theme === "dark" ? "#FFFFFF" : "#111827",
      "--overlay-bg": theme === "dark" ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.38)",
      "--eval-pass-fill": theme === "dark" ? "#14532d" : "#dcfce7",
      "--eval-pass-stroke": theme === "dark" ? "#22c55e" : "#16a34a",
      "--eval-fail-fill": theme === "dark" ? "#450a0a" : "#fee2e2",
      "--eval-fail-stroke": theme === "dark" ? "#ef4444" : "#dc2626",
      "--eval-error-fill": theme === "dark" ? "#451a03" : "#fef3c7",
      "--eval-error-stroke": theme === "dark" ? "#f59e0b" : "#d97706",
      ...style,
    } as React.CSSProperties;

    return (
      <div
        ref={containerRef}
        className={canvasClassName}
        style={canvasStyle}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={(e) => {
          pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          // Check if this was a drag or a click
          if (!pointerDownPosRef.current) return;
          
          const dx = e.clientX - pointerDownPosRef.current.x;
          const dy = e.clientY - pointerDownPosRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          pointerDownPosRef.current = null;
          
          // If moved less than 5px, treat as click
          if (distance < 5) {
            handleCanvasClick(e);
          }
          // If moved more, it was a drag - don't clear highlight
        }}
        {...bindLongPress()}
      >
        {showControls && (
          <Controls
            onFocusRoot={focusFirstNode}
            onCenterView={centerView}
            onZoomOut={zoomOut}
            onZoomIn={zoomIn}
          />
        )}

        {aboveSupportedLimit &&
          (tooLargeContent ? (
            tooLargeContent
          ) : (
            <div className={styles.tooLarge}>
              {`This graph has ${totalNodes} nodes and exceeds the maxRenderableNodes limit (${maxRenderableNodes}).`}
            </div>
          ))}

        {loading && (
          <div className={styles.overlay}>
            <div className={styles.spinner} />
          </div>
        )}

        <Space
          onCreate={nextViewPort => {
            setViewPort(nextViewPort);
            onViewportCreateRef.current?.(nextViewPort);
          }}
          onContextMenu={event => event.preventDefault()}
          treatTwoFingerTrackPadGesturesLikeTouch={trackpadZoom}
          pollForElementResizing
          className="jsoncrack-space"
        >
          <Canvas
            className="jsoncrack-canvas"
            onLayoutChange={onLayoutChange}
            node={nodeProps => (
              <CustomNode
                {...nodeProps}
                onNodeClick={onNodeClick}
                onNodeSingleClick={handleNodeSingleClick}
                highlightedNodeIds={highlightedNodeIds}
                incomingEdgeColor={edgeColorByNodeId.get((nodeProps.properties as NodeData).id)}
              />
            )}
            edge={edgeProps => (
              <CustomEdge
                {...edgeProps}
                viewPort={viewPort}
                edgeTargetById={edgeTargetById}
                hostElement={containerRef.current}
                highlightedEdgeIds={highlightedEdgeIds}
              />
            )}
            nodes={visibleNodes}
            edges={visibleEdges}
            arrow={null}
            maxHeight={paneHeight}
            maxWidth={paneWidth}
            height={paneHeight}
            width={paneWidth}
            direction={layoutDirection}
            layoutOptions={layoutOptions}
            key={layoutDirection}
            pannable={false}
            zoomable={false}
            animated={false}
            readonly
            dragEdge={null}
            dragNode={null}
            fit={shouldFitCanvas}
          />
        </Space>

        {/* Button overlay portal — rendered AFTER edges in SVG DOM so buttons paint on top */}
        {btnPortalTarget &&
          ReactDOM.createPortal(
            <>
              {visibleNodes.map(nodeData => {
                const layout = nodeLayoutMap.get(nodeData.id);
                if (!layout) return null;
                return nodeData.text.map((row, rowIndex) => {
                  if (!row.key || !row.to?.length) return null;
                  const cy = rowIndex * BTN_ROW_HEIGHT + BTN_ROW_HEIGHT / 2;
                  const isCollapsed = collapsedFields.get(nodeData.id)?.has(row.key) ?? false;
                  return (
                    <g
                      key={`overlay-${nodeData.id}-${rowIndex}`}
                      transform={`translate(${layout.x + layout.width},${layout.y + cy})`}
                      onClick={e => {
                        e.stopPropagation();
                        handleToggleField(nodeData.id, row.key!);
                      }}
                      style={{ cursor: "pointer", outline: "none" }}
                      tabIndex={-1}
                    >
                      <circle
                        r={BTN_R}
                        fill="var(--node-fill)"
                        stroke={row.portColor ?? "var(--node-stroke)"}
                        strokeWidth="2"
                      />
                      <line
                        x1={-(BTN_R - 3)} y1="0"
                        x2={BTN_R - 3} y2="0"
                        stroke={row.portColor ?? "var(--node-key)"}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
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
                });
              })}
            </>,
            btnPortalTarget
          )}
      </div>
    );
  }
);

JSONCrack.displayName = "JSONCrack";
