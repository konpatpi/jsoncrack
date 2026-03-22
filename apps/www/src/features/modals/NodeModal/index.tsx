import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Divider, Badge } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "jsoncrack-react";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";

// ─── helpers ────────────────────────────────────────────────────────────────

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, unknown> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

type PolicyNodeKind = "policyCondition" | "policyActionStatement" | "policyRule" | null;

/** Determine which special policy kind this node is, based on its path. */
const detectPolicyKind = (path?: NodeData["path"]): PolicyNodeKind => {
  if (!path) return null;
  if (path.some(seg => seg === "policyActionStatement")) return "policyActionStatement";
  if (path.some(seg => seg === "policyCondition" || seg === "policyConditionStatement"))
    return "policyCondition";
  if (path.some(seg => seg === "policyRule")) return "policyRule";
  return null;
};

type OriginalRoot = Record<string, unknown>;

const safeParseOriginalRoot = (originalJson: string): OriginalRoot | null => {
  try {
    return JSON.parse(originalJson) as OriginalRoot;
  } catch {
    return null;
  }
};

/**
 * For policyCondition nodes:
 * Navigate originalJson using the node's full path up to the policyCondition array,
 * then find the correct condition item.
 * Handles both single-group (flat array) and multi-group cases.
 */
const getConditionOriginal = (
  path: NonNullable<NodeData["path"]>,
  root: OriginalRoot
): string | null => {
  const pcIdx = path.findIndex(seg => seg === "policyCondition");
  if (pcIdx === -1) return null;

  // Navigate from root through all path segments BEFORE "policyCondition"
  // This handles nested conditions like root.PLRLxxx.policyCondition
  let target: unknown = root;
  for (let i = 0; i < pcIdx; i++) {
    if (target == null || typeof target !== "object") return null;
    target = (target as Record<string | number, unknown>)[path[i]];
  }

  const pcArray = (target as Record<string, unknown>)?.["policyCondition"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (!Array.isArray(pcArray)) return null;

  const nextSeg = path[pcIdx + 1];
  let item: Record<string, unknown> | undefined;

  if (typeof nextSeg === "number") {
    // Single-group flat array: policyCondition[N]
    item = pcArray[nextSeg];
  } else if (typeof nextSeg === "string") {
    // Multi-group object: policyCondition["Group N (AND)"][subIdx]
    const gMatch = nextSeg.match(/Group\s+(\d+)/i);
    const gNum = gMatch ? parseInt(gMatch[1], 10) : null;
    const subIdx = path[pcIdx + 2];
    if (gNum !== null && typeof subIdx === "number") {
      type CondItem = { conditionGroupNumber?: number | null };
      const groupItems = (pcArray as CondItem[]).filter(
        c => (c.conditionGroupNumber ?? 1) === gNum
      );
      item = groupItems[subIdx] as Record<string, unknown> | undefined;
    }
  }

  if (!item) return null;
  const stmt = item["policyConditionStatement"];
  return stmt !== undefined ? JSON.stringify(stmt, null, 2) : null;
};

/**
 * For policyActionStatement nodes:
 * Navigate originalJson using the node's full path up to policyAction,
 * then extract policyActionStatement.
 * Returns { statement, policyValue }
 */
const getActionOriginal = (
  path: NonNullable<NodeData["path"]>,
  root: OriginalRoot
): { statement: string | null; policyValue: string | null } => {
  const paIdx = path.findIndex(seg => seg === "policyAction");

  // Navigate from root through all path segments BEFORE "policyAction"
  let parent: unknown = root;
  const navEnd = paIdx !== -1 ? paIdx : 0;
  for (let i = 0; i < navEnd; i++) {
    if (parent == null || typeof parent !== "object") break;
    parent = (parent as Record<string | number, unknown>)[path[i]];
  }

  const paArray = (parent as Record<string, unknown>)?.["policyAction"] as
    | Array<Record<string, unknown>>
    | undefined;

  let stmt: Record<string, unknown> | undefined;

  if (Array.isArray(paArray)) {
    const itemIdx = paIdx !== -1 ? path[paIdx + 1] : undefined;
    const item = typeof itemIdx === "number" ? paArray[itemIdx] : paArray[0];
    stmt = item?.["policyActionStatement"] as Record<string, unknown> | undefined;
  } else {
    // Fallback: policyActionStatement directly at parent
    stmt = (parent as Record<string, unknown>)?.["policyActionStatement"] as
      | Record<string, unknown>
      | undefined;
  }

  const pv = stmt?.["policyValue"];
  return {
    statement: stmt ? JSON.stringify(stmt, null, 2) : null,
    policyValue: pv != null ? JSON.stringify(pv, null, 2) : null,
  };
};

/**
 * For policyRule nodes:
 * policyRule items are never transformed, so we directly navigate the current
 * displayed JSON using the node's path to get the full original object.
 */
const getRuleOriginal = (
  path: NonNullable<NodeData["path"]>,
  currentJson: string
): string | null => {
  try {
    let target: unknown = JSON.parse(currentJson);
    for (const seg of path) {
      if (target == null) return null;
      target = (target as Record<string | number, unknown>)[seg];
    }
    return target !== undefined ? JSON.stringify(target, null, 2) : null;
  } catch {
    return null;
  }
};

// ─── sub-component ──────────────────────────────────────────────────────────

const OriginalJsonSection = ({ code }: { code: string }) => (
  <>
    <Divider />
    <Stack gap="xs">
      <Flex align="center" gap="xs">
        <Text fz="xs" fw={500}>
          Original JSON
        </Text>
        <Badge size="xs" color="orange" variant="light">
          pre-transform
        </Badge>
      </Flex>
      <ScrollArea.Autosize mah={300} maw={600}>
        <CodeHighlight code={code} miw={350} maw={600} language="json" withCopyButton />
      </ScrollArea.Autosize>
    </Stack>
  </>
);

// ─── modal ───────────────────────────────────────────────────────────────────

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const originalJson = useJson(state => state.originalJson);
  const currentJson = useJson(state => state.json);

  const path = nodeData?.path;
  const kind = detectPolicyKind(path);
  const hasOriginal = originalJson !== "{}";
  const root = hasOriginal && kind && kind !== "policyRule" ? safeParseOriginalRoot(originalJson) : null;

  // --- Derived data per kind ---
  const condOriginal =
    kind === "policyCondition" && root && path
      ? getConditionOriginal(path, root)
      : null;

  const actionData =
    kind === "policyActionStatement" && root && path
      ? getActionOriginal(path, root)
      : null;

  const ruleOriginal =
    kind === "policyRule" && path
      ? getRuleOriginal(path, currentJson)
      : null;

  // Content override for policyActionStatement: no longer needed — transform already keeps only policyValue
  const contentOverride: string | null = null;

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        {/* ── Content ── */}
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
              {kind === "policyActionStatement" && (
                <Badge size="xs" color="violet" variant="light" ml={6}>
                  policyValue
                </Badge>
              )}
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            <CodeHighlight
              code={contentOverride ?? normalizeNodeData(nodeData?.text ?? [])}
              miw={350}
              maw={600}
              language="json"
              withCopyButton
            />
          </ScrollArea.Autosize>
        </Stack>

        {/* ── JSON Path ── */}
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>

        {/* ── Original JSON: policyConditionStatement ── */}
        {condOriginal && <OriginalJsonSection code={condOriginal} />}

        {/* ── Original JSON: policyActionStatement ── */}
        {actionData?.statement && <OriginalJsonSection code={actionData.statement} />}

        {/* ── Original JSON: policyRule ── */}
        {ruleOriginal && <OriginalJsonSection code={ruleOriginal} />}
      </Stack>
    </Modal>
  );
};
