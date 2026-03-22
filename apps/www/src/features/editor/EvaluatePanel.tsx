import React from "react";
import { Button, Text, Badge, Table, ScrollArea } from "@mantine/core";
import styled from "styled-components";
import Editor from "@monaco-editor/react";
import { JSONPath } from "jsonpath-plus";
import { injectEvalIntoCompactJson, type EvalResultData } from "../../lib/utils/policyTransform";
import useConfig from "../../store/useConfig";
import useJson from "../../store/useJson";

interface PolicyVariable {
  displayVariable?: string | null;
  source?: string | null;
  sourceType?: string | null;
}

interface PolicyOperator {
  name?: string | null;
  opType?: number | null;
}

interface PolicyValue {
  name?: string | null;
  valueType?: string | null;
  target?: string | null;
  targetType?: string | null;
}

interface PolicyConditionStatement {
  policyVariable?: PolicyVariable | null;
  policyOperator?: PolicyOperator | null;
  policyValue?: PolicyValue | null;
}

interface PolicyCondition {
  id?: string;
  conditionGroupNumber?: number | null;
  name?: string | null;
  status?: string | null;
  policyConditionStatement?: PolicyConditionStatement | null;
}

interface EvalResult {
  conditionId: string;
  conditionName: string;
  jsonPath: string;
  extractedValue: unknown;
  operator: string;
  expectedValue: string;
  pass: boolean | null;
  error?: string;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const InputSection = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 6px 8px 4px;
  gap: 4px;
`;

const EditorBox = styled.div`
  flex: 1;
  min-height: 0;
  border: 1px solid var(--mantine-color-default-border);
  border-radius: 4px;
  overflow: hidden;
`;

const ActionRow = styled.div`
  padding: 6px 8px;
  border-top: 1px solid var(--mantine-color-default-border);
  border-bottom: 1px solid var(--mantine-color-default-border);
`;

const ResultsSection = styled.div`
  flex: 1.2;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ResultsHeader = styled.div`
  padding: 6px 8px 2px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

function evaluateOperator(actual: unknown, operatorName: string, expected: string): boolean {
  const op = operatorName.toLowerCase().replace(/[_\s-]/g, "");
  const expectedNum = parseFloat(expected);
  const actualNum = typeof actual === "number" ? actual : parseFloat(String(actual));

  switch (op) {
    case "eq":
    case "equal":
    case "equals":
      return String(actual) === expected;
    case "ne":
    case "neq":
    case "notequal":
    case "notequals":
      return String(actual) !== expected;
    case "gt":
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum > expectedNum;
    case "gte":
    case "ge":
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum >= expectedNum;
    case "lt":
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum < expectedNum;
    case "lte":
    case "le":
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum <= expectedNum;
    case "contains":
      return String(actual).includes(expected);
    case "startswith":
      return String(actual).startsWith(expected);
    case "endswith":
      return String(actual).endsWith(expected);
    case "in": {
      try {
        const arr = JSON.parse(expected);
        if (Array.isArray(arr)) return arr.includes(actual);
      } catch {
        // fallthrough to comma-split
      }
      return expected
        .split(",")
        .map(s => s.trim())
        .includes(String(actual));
    }
    default:
      return String(actual) === expected;
  }
}

function collectConditions(obj: unknown, results: PolicyCondition[] = []): PolicyCondition[] {
  if (!obj || typeof obj !== "object") return results;
  if (Array.isArray(obj)) {
    obj.forEach(item => collectConditions(item, results));
    return results;
  }
  const record = obj as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (key === "policyCondition") {
      if (Array.isArray(val)) {
        // Single-group: PolicyCondition[]
        (val as PolicyCondition[]).forEach(c => results.push(c));
      } else if (val && typeof val === "object") {
        // Multi-group: { "Group N (AND)": PolicyCondition[] }
        for (const groupVal of Object.values(val as Record<string, unknown>)) {
          if (Array.isArray(groupVal)) {
            (groupVal as PolicyCondition[]).forEach(c => results.push(c));
          }
        }
      }
    } else {
      collectConditions(val, results);
    }
  }
  return results;
}

export const EvaluatePanel = () => {
  const originalJson = useJson(state => state.originalJson);
  const setEvalJson = useJson(state => state.setEvalJson);
  const clearEvalJson = useJson(state => state.clearEvalJson);
  const theme = useConfig(state => (state.darkmodeEnabled ? "vs-dark" : "light"));
  const [decisionModelInput, setDecisionModelInput] = React.useState("{\n  \n}");
  const [results, setResults] = React.useState<EvalResult[]>([]);
  const [hasRun, setHasRun] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const clearEvaluation = React.useCallback(() => {
    clearEvalJson();
    setResults([]);
    setHasRun(false);
    setParseError(null);
  }, [clearEvalJson]);

  const passCount = results.filter(r => r.pass === true).length;
  const failCount = results.filter(r => r.pass === false).length;
  const errorCount = results.filter(r => r.pass === null).length;

  const runEvaluation = () => {
    setParseError(null);
    let decisionModel: unknown;

    try {
      decisionModel = JSON.parse(decisionModelInput);
    } catch (err) {
      setParseError(
        `Invalid Decision Model JSON: ${err instanceof Error ? err.message : "Parse error"}`
      );
      return;
    }

    let policyJson: unknown;
    try {
      policyJson = JSON.parse(originalJson);
    } catch {
      setParseError("No valid policy JSON loaded.");
      return;
    }

    const conditions = collectConditions(policyJson);
    const evalResults: EvalResult[] = [];

    for (const condition of conditions) {
      const stmt = condition.policyConditionStatement;
      if (!stmt) continue;

      const pv = stmt.policyVariable;
      const op = stmt.policyOperator;
      const val = stmt.policyValue;

      // Only evaluate jsonpath-type variables
      if (!pv?.source || pv.sourceType?.toLowerCase() !== "jsonpath") continue;

      const jsonPath = pv.source;
      const operatorName = op?.name ?? "eq";
      const expectedValue = val?.target ?? val?.name ?? "";

      try {
        const extracted = JSONPath({ path: jsonPath, json: decisionModel as object });
        const actualValue =
          Array.isArray(extracted) && extracted.length === 1 ? extracted[0] : extracted;

        const pass = evaluateOperator(actualValue, operatorName, String(expectedValue));
        evalResults.push({
          conditionId: condition.id ?? "",
          conditionName: condition.name ?? condition.id ?? "?",
          jsonPath,
          extractedValue: actualValue,
          operator: operatorName,
          expectedValue: String(expectedValue),
          pass,
        });
      } catch (err) {
        evalResults.push({
          conditionId: condition.id ?? "",
          conditionName: condition.name ?? condition.id ?? "?",
          jsonPath,
          extractedValue: undefined,
          operator: operatorName,
          expectedValue: String(expectedValue),
          pass: null,
          error: err instanceof Error ? err.message : "Error",
        });
      }
    }

    setResults(evalResults);
    setHasRun(true);

    // Build map keyed by conditionId for policyTransform
    const evalResultsData: Record<string, EvalResultData> = {};
    for (const r of evalResults) {
      if (r.conditionId) {
        evalResultsData[r.conditionId] = {
          extractedValue: r.extractedValue,
          operator: r.operator,
          expectedValue: r.expectedValue,
          pass: r.pass,
          error: r.error,
        };
      }
    }

    // Inject eval annotations into the current compact graph JSON.
    // We use useJson.json (which includes all merged policyRules) rather than
    // originalJson (which may only contain the base document).
    const currentGraphJson = useJson.getState().json;
    const enrichedJson = injectEvalIntoCompactJson(currentGraphJson, evalResultsData);
    setEvalJson(enrichedJson);
  };

  const formatExtracted = (value: unknown): string => {
    if (value === undefined || value === null) return "null";
    if (Array.isArray(value) && value.length === 0) return "(no match)";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <Wrapper>
      <InputSection>
        <Text fz="xs" fw={600} c="dimmed" style={{ letterSpacing: "0.05em" }}>
          DECISION MODEL DATA (JSON)
        </Text>
        <EditorBox>
          <Editor
            height="100%"
            defaultLanguage="json"
            value={decisionModelInput}
            onChange={value => setDecisionModelInput(value ?? "{}")}
            options={{
              minimap: { enabled: false },
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              fontSize: 12,
              tabSize: 2,
              wordWrap: "on",
            }}
            theme={theme}
          />
        </EditorBox>
      </InputSection>

      <ActionRow>
        {parseError && (
          <Text fz="xs" c="red" mb={4}>
            {parseError}
          </Text>
        )}
        <Button.Group style={{ width: "100%" }}>
          <Button size="xs" style={{ flex: 1 }} onClick={runEvaluation}>
            Run Evaluation
          </Button>
          {hasRun && (
            <Button size="xs" variant="default" onClick={clearEvaluation}>
              Clear
            </Button>
          )}
        </Button.Group>
      </ActionRow>

      <ResultsSection>
        <ResultsHeader>
          <Text fz="xs" fw={600} c="dimmed" style={{ letterSpacing: "0.05em", flex: 1 }}>
            RESULTS
          </Text>
          {hasRun && results.length > 0 && (
            <>
              <Badge color="green" size="xs" variant="light">
                {passCount} PASS
              </Badge>
              <Badge color="red" size="xs" variant="light">
                {failCount} FAIL
              </Badge>
              {errorCount > 0 && (
                <Badge color="gray" size="xs" variant="light">
                  {errorCount} ERROR
                </Badge>
              )}
            </>
          )}
        </ResultsHeader>

        <ScrollArea style={{ flex: 1 }} px="xs" pb="xs">
          {!hasRun && (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
              Paste decision model data above and click Run Evaluation.
            </Text>
          )}
          {hasRun && results.length === 0 && (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
              No <code>jsonpath</code>-type policy variables found in the loaded policy JSON.
            </Text>
          )}
          {hasRun && results.length > 0 && (
            <Table fz="xs" striped withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Condition</Table.Th>
                  <Table.Th>JSON Path</Table.Th>
                  <Table.Th>Extracted</Table.Th>
                  <Table.Th>Op</Table.Th>
                  <Table.Th>Expected</Table.Th>
                  <Table.Th>Result</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {results.map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{r.conditionName}</Table.Td>
                    <Table.Td>
                      <code>{r.jsonPath}</code>
                    </Table.Td>
                    <Table.Td>
                      {r.error ? (
                        <Text c="red" fz="xs">
                          {r.error}
                        </Text>
                      ) : (
                        formatExtracted(r.extractedValue)
                      )}
                    </Table.Td>
                    <Table.Td>{r.operator}</Table.Td>
                    <Table.Td>{r.expectedValue}</Table.Td>
                    <Table.Td>
                      {r.pass === null ? (
                        <Badge color="gray" size="xs">
                          Error
                        </Badge>
                      ) : r.pass ? (
                        <Badge color="green" size="xs">
                          PASS
                        </Badge>
                      ) : (
                        <Badge color="red" size="xs">
                          FAIL
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </ResultsSection>
    </Wrapper>
  );
};
