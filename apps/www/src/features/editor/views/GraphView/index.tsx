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

  .jsoncrack-space {
    cursor: url("/assets/cursor.svg"), auto;
  }

  .jsoncrack-space:active {
    cursor: grabbing;
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
  const json = useJson(state => state.json);
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
      let el = e.target as Element | null;
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

  const maxVisibleNodes = Number.isFinite(SUPPORTED_LIMIT) ? SUPPORTED_LIMIT : 1500;

  return (
    <Box pos="relative" h="100%" w="100%">
      {!isWidget && <OptionsMenu />}
      {!isWidget && <SecureInfo />}
      <ZoomControl />
      <NodeContextMenu />
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
    </Box>
  );
};
