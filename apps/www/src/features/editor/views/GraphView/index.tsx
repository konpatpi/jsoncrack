import React from "react";
import { Box } from "@mantine/core";
import styled from "styled-components";
import { JSONCrack } from "jsoncrack-react";
import type { GraphData, NodeData } from "jsoncrack-react";
import { SUPPORTED_LIMIT } from "../../../../constants/graph";
import useConfig from "../../../../store/useConfig";
import useJson from "../../../../store/useJson";
import { useModal } from "../../../../store/useModal";
import { NodeContextMenu } from "./NodeContextMenu";
import { NotSupported } from "./NotSupported";
import { OptionsMenu } from "./OptionsMenu";
import { SecureInfo } from "./SecureInfo";
import { ZoomControl } from "./ZoomControl";
import useGraph from "./stores/useGraph";

const StyledEditorWrapper = styled.div<{ $widget: boolean }>`
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 0;
  isolation: isolate;

  .jsoncrack-space {
    cursor: url("/assets/cursor.svg"), auto;
  }

  .jsoncrack-space:active {
    cursor: grabbing;
  }

  [class*="_port_"] {
    opacity: 0;
  }

  use[style*="pointer-events: none"] {
    display: none;
  }
`;

interface GraphProps {
  isWidget?: boolean;
}

export const GraphView = ({ isWidget = false }: GraphProps) => {
  const setViewPort = useGraph(state => state.setViewPort);
  const direction = useGraph(state => state.direction);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setNodes = useGraph(state => state.setNodes);
  const setContextMenu = useGraph(state => state.setContextMenu);
  const nodes = useGraph(state => state.nodes);
  const gesturesEnabled = useConfig(state => state.gesturesEnabled);
  const rulersEnabled = useConfig(state => state.rulersEnabled);
  const darkmodeEnabled = useConfig(state => state.darkmodeEnabled);
  const json = useJson(state => state.evalJson ?? state.json);
  const setVisible = useModal(state => state.setVisible);

  const blurOnClick = React.useCallback(() => {
    if ("activeElement" in document) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, []);

  const handleNodeClick = React.useCallback(
    (node: NodeData) => {
      setSelectedNode(node);
      setVisible("NodeModal", true);
    },
    [setSelectedNode, setVisible]
  );

  const handleParse = React.useCallback(
    (graph: GraphData) => {
      setNodes(graph);
    },
    [setNodes]
  );

  // Container-level context menu: traverse DOM to find which node was clicked
  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();

      // Walk up from target to find <g id="...-node-X">
      let el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement ?? null;
      let nodeId: string | null = null;
      while (el && el !== e.currentTarget) {
        const id = el.getAttribute("id");
        if (id) {
          const match = id.match(/(?:^|-)node-(\d+)$/);
          if (match) {
            nodeId = match[1];
            break;
          }
        }
        el = el.parentElement;
      }

      if (!nodeId) {
        setContextMenu(null);
        return;
      }

      const clickedNode = nodes.find(n => n.id === nodeId);
      if (!clickedNode) {
        setContextMenu(null);
        return;
      }

      setContextMenu({ node: clickedNode, x: e.clientX, y: e.clientY });
    },
    [nodes, setContextMenu]
  );

  // Reorder SVG groups so edges render behind nodes (SVG paint order = DOM order)
  React.useEffect(() => {
    let wrapper: Element | null = null;

    const observer = new MutationObserver(() => {
      // Disconnect first to avoid infinite loop (our DOM changes would re-trigger)
      observer.disconnect();

      const svg = document.querySelector("[id^='ref-'] > g");
      if (svg) {
        const edges = svg.querySelectorAll("[class*='_edge_']");
        const firstNode = svg.querySelector("[id*='-node-']");
        if (firstNode && edges.length > 0) {
          edges.forEach(edge => svg.insertBefore(edge, firstNode));
        }
      }

      // Reconnect after reordering
      if (wrapper) {
        observer.observe(wrapper, { childList: true, subtree: true });
      }
    });

    // Delayed start: wait for SVG to render
    const timer = setTimeout(() => {
      wrapper = document.querySelector(".jsoncrack-canvas");
      if (wrapper) {
        observer.observe(wrapper, { childList: true, subtree: true });
        // Trigger initial reorder
        const svg = document.querySelector("[id^='ref-'] > g");
        if (svg) {
          const edges = svg.querySelectorAll("[class*='_edge_']");
          const firstNode = svg.querySelector("[id*='-node-']");
          if (firstNode && edges.length > 0) {
            edges.forEach(edge => svg.insertBefore(edge, firstNode));
          }
        }
      }
    }, 800);

    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [json, direction]);

  const maxVisibleNodes = Number.isFinite(SUPPORTED_LIMIT) ? SUPPORTED_LIMIT : 1500;

  return (
    <Box pos="relative" h="100%" w="100%">
      <StyledEditorWrapper
        $widget={isWidget}
        onContextMenu={handleContextMenu}
        onClick={blurOnClick}
      >
        <JSONCrack
          key={[direction, gesturesEnabled, rulersEnabled].join("-")}
          json={json}
          theme={darkmodeEnabled ? "dark" : "light"}
          layoutDirection={direction}
          showControls={false}
          showGrid={rulersEnabled}
          trackpadZoom={gesturesEnabled}
          maxRenderableNodes={maxVisibleNodes}
          centerOnLayout
          onViewportCreate={setViewPort}
          onNodeClick={handleNodeClick}
          onParse={handleParse}
          renderNodeLimitExceeded={() => <NotSupported />}
        />
      </StyledEditorWrapper>
      {!isWidget && <OptionsMenu />}
      {!isWidget && <SecureInfo />}
      <ZoomControl />
      <NodeContextMenu />
    </Box>
  );
};
