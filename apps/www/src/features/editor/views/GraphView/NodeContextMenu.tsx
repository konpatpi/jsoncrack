import React from "react";
import { Paper, Stack, Button, Text, Divider, Group, Badge } from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import type { NodeData } from "jsoncrack-react";
import { LuSearch, LuInfo, LuExternalLink } from "react-icons/lu";
import { detectPolicyType, extractPolicyCodes, buildGitHubWebUrl } from "../../../../hooks/useGitHubSearch";
import useGitHubSearch from "../../../../hooks/useGitHubSearch";
import useGraph from "./stores/useGraph";

export const NodeContextMenu = () => {
  const contextMenu = useGraph(state => state.contextMenu);
  const setContextMenu = useGraph(state => state.setContextMenu);
  const { findAndLoad, searching } = useGitHubSearch();

  const ref = useClickOutside(() => setContextMenu(null));

  if (!contextMenu) return null;

  const { node, x, y } = contextMenu;
  const policyCodes = extractPolicyCodes(node.text);

  const handleFind = (code: string) => {
    setContextMenu(null);
    findAndLoad(code, node);
  };

  return (
    <Paper
      ref={ref}
      shadow="md"
      radius="sm"
      p="xs"
      withBorder
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 9999,
        minWidth: 200,
        maxWidth: 300,
      }}
    >
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed" px={4}>
          Node Actions
        </Text>
        <Divider />

        {policyCodes.length > 0 ? (
          <>
            <Text size="xs" c="dimmed" px={4} pt={4}>
              ค้นหาใน GitHub:
            </Text>
            {policyCodes.map(code => {
              const policyType = detectPolicyType(code);
              return (
                <React.Fragment key={code}>
                  <Button
                    variant="subtle"
                    size="xs"
                    justify="start"
                    leftSection={<LuSearch size={13} />}
                    loading={searching}
                    onClick={() => handleFind(code)}
                    style={{ fontFamily: "monospace" }}
                  >
                    <Group gap={6}>
                      <span>{code}</span>
                      {policyType && (
                        <Badge size="xs" variant="light" color="blue">
                          {policyType}
                        </Badge>
                      )}
                    </Group>
                  </Button>
                  <Button
                    variant="subtle"
                    size="xs"
                    justify="start"
                    leftSection={<LuExternalLink size={13} />}
                    component="a"
                    href={buildGitHubWebUrl(code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "monospace" }}
                  >
                    Open on Web — {code}
                  </Button>
                </React.Fragment>
              );
            })}
          </>
        ) : (
          <Group gap={6} px={4} py={4}>
            <LuInfo size={13} style={{ color: "var(--mantine-color-dimmed)" }} />
            <Text size="xs" c="dimmed">
              ไม่พบ policy code (PLSE/PLGP/PLRL)
            </Text>
          </Group>
        )}
      </Stack>
    </Paper>
  );
};
