// Policy Condition Compact Transform
// Converts deeply nested policyCondition arrays into a compact, readable representation:
// policyVariable [operator] policyValue

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
  isCNF?: boolean | null;
  name?: string | null;
  status?: string | null;
  policyConditionStatement?: PolicyConditionStatement | null;
}

export interface EvalResultData {
  extractedValue: unknown;
  operator: string;
  expectedValue: string;
  pass: boolean | null;
  error?: string;
}

const formatConditionLine = (c: PolicyCondition, evalResult?: EvalResultData): string => {
  const stmt = c.policyConditionStatement;

  const idLine = `id: ${c.id ?? "null"}`;
  const nameLine = `name: ${c.name ?? "null"}`;

  if (!stmt) return `${idLine}\n${nameLine}`;

  // Value display: target if not null, else name
  const pv = stmt.policyValue;
  const valueDisplay =
    pv?.target != null
      ? pv.target
      : pv?.name != null
        ? pv.name
        : "null";

  // condition row
  const source = stmt.policyVariable?.source ?? "null";
  const opName = stmt.policyOperator?.name ?? "null";
  const opType = stmt.policyOperator?.opType;
  const opPart = opType != null ? `${opName} (${opType})` : opName;
  const condLine = `condition: ${source} | ${opPart} | ${valueDisplay}`;

  const parts = [idLine, nameLine, condLine];

  if (evalResult) {
    const extractedStr =
      evalResult.error
        ? "error"
        : Array.isArray(evalResult.extractedValue) &&
            (evalResult.extractedValue as unknown[]).length === 0
          ? "(no match)"
          : evalResult.extractedValue == null
            ? "null"
            : String(evalResult.extractedValue);

    parts.push(`evaluate: ${extractedStr} ${evalResult.operator} ${evalResult.expectedValue}`);
    parts.push(
      evalResult.pass === null ? "result: ERROR" : evalResult.pass ? "result: PASS" : "result: FAIL"
    );
  }

  return parts.join("\n");
};

/** Compact a single policyCondition array into grouped, readable representation */
export const compactConditionArray = (
  conditions: PolicyCondition[],
  evalResults?: Record<string, EvalResultData>
): Record<string, string[]> | string[] => {
  // Group by conditionGroupNumber
  const groups = new Map<number, PolicyCondition[]>();
  for (const c of conditions) {
    const gNum = c.conditionGroupNumber ?? 1;
    if (!groups.has(gNum)) groups.set(gNum, []);
    groups.get(gNum)!.push(c);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);

  const toLine = (c: PolicyCondition): string =>
    formatConditionLine(c, evalResults?.[c.id ?? ""]);

  // Single group โ’ flat array
  if (sortedGroups.length === 1) {
    return sortedGroups[0][1].map(toLine);
  }

  // Multiple groups โ’ object with group keys (AND within, OR between)
  const result: Record<string, string[]> = {};
  for (const [gNum, conds] of sortedGroups) {
    const logic = conds[0]?.isCNF !== false ? "AND" : "OR";
    result[`Group ${gNum} (${logic})`] = conds.map(toLine);
  }
  return result;
};

/** Recursively traverse any JSON object and compact all policyCondition arrays */
export const compactPolicyConditions = (
  value: unknown,
  evalResults?: Record<string, EvalResultData>
): unknown => {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return (value as unknown[]).map(item => compactPolicyConditions(item, evalResults));
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (key === "policyCondition" && Array.isArray(val) && val.length > 0) {
      // Check it looks like a policy condition array (has policyConditionStatement)
      const firstItem = val[0] as Record<string, unknown>;
      if ("policyConditionStatement" in firstItem || "conditionGroupNumber" in firstItem) {
        result[key] = compactConditionArray(val as PolicyCondition[], evalResults);
        continue;
      }
    }
    if (key === "policyActionStatement" && val !== null && typeof val === "object" && !Array.isArray(val)) {
      // Keep only policyValue โ€” policyVariable and policyOperator are stripped from graph display
      const stmt = val as Record<string, unknown>;
      result[key] = stmt["policyValue"] !== undefined
        ? { policyValue: stmt["policyValue"] }
        : {};
      continue;
    }
    result[key] = compactPolicyConditions(val, evalResults);
  }

  return result;
};

/** Apply the transform to a JSON string, returns compacted JSON string */
export const applyPolicyTransform = (jsonStr: string): string => {
  try {
    const parsed = JSON.parse(jsonStr);
    const transformed = compactPolicyConditions(parsed);
    return JSON.stringify(transformed, null, 2);
  } catch {
    return jsonStr;
  }
};

/** Apply the transform with evaluation results injected into each condition node */
export const applyPolicyTransformWithEval = (
  jsonStr: string,
  evalResults: Record<string, EvalResultData>
): string => {
  try {
    const parsed = JSON.parse(jsonStr);
    const transformed = compactPolicyConditions(parsed, evalResults);
    return JSON.stringify(transformed, null, 2);
  } catch {
    return jsonStr;
  }
};

/** Detect if a JSON string needs policy transform (policyCondition or policyActionStatement) */
export const hasPolicyConditions = (jsonStr: string): boolean => {
  return jsonStr.includes('"policyCondition"') || jsonStr.includes('"policyActionStatement"');
};

// ── Inject eval results into already-compact JSON ──────────────────────────

/** Format the evaluate/result lines for a single eval result */
const formatEvalLines = (er: EvalResultData): string => {
  const extractedStr = er.error
    ? "error"
    : Array.isArray(er.extractedValue) && (er.extractedValue as unknown[]).length === 0
      ? "(no match)"
      : er.extractedValue == null
        ? "null"
        : String(er.extractedValue);

  const evalLine = `evaluate: ${extractedStr} ${er.operator} ${er.expectedValue}`;
  const resultLine = er.pass === null ? "result: ERROR" : er.pass ? "result: PASS" : "result: FAIL";
  return `${evalLine}\n${resultLine}`;
};

/** Annotate a single compact condition string with eval data (if its id matches) */
const annotateConditionString = (
  str: string,
  evalResults: Record<string, EvalResultData>
): string => {
  const idMatch = str.match(/^id:\s*(.+)$/m);
  if (!idMatch) return str;
  const id = idMatch[1].trim();
  const er = evalResults[id];
  if (!er) return str;
  // Strip any existing evaluate/result lines then re-append
  const base = str.replace(/\nevaluate:.*$/gm, "").replace(/\nresult:.*$/gm, "");
  return `${base}\n${formatEvalLines(er)}`;
};

/** Recursively walk any JSON value and annotate compact policyCondition arrays */
const annotateRecursive = (
  value: unknown,
  evalResults: Record<string, EvalResultData>
): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(v => annotateRecursive(v, evalResults));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "policyCondition") {
      if (Array.isArray(val)) {
        // Single-group: string[]
        out[key] = val.map(s =>
          typeof s === "string" ? annotateConditionString(s, evalResults) : annotateRecursive(s, evalResults)
        );
      } else if (val && typeof val === "object") {
        // Multi-group: { "Group N (AND)": string[] }
        const groupObj = val as Record<string, unknown>;
        const annotatedGroup: Record<string, unknown> = {};
        for (const [groupKey, groupVal] of Object.entries(groupObj)) {
          annotatedGroup[groupKey] = Array.isArray(groupVal)
            ? groupVal.map(s => (typeof s === "string" ? annotateConditionString(s, evalResults) : s))
            : annotateRecursive(groupVal, evalResults);
        }
        out[key] = annotatedGroup;
      } else {
        out[key] = val;
      }
    } else {
      out[key] = annotateRecursive(val, evalResults);
    }
  }
  return out;
};

/**
 * Inject eval results into an already-compact JSON string.
 * This preserves all existing graph data (including merged policyRules)
 * and only modifies the policyCondition strings to add evaluate/result lines.
 */
export const injectEvalIntoCompactJson = (
  compactJsonStr: string,
  evalResults: Record<string, EvalResultData>
): string => {
  try {
    const parsed = JSON.parse(compactJsonStr);
    const annotated = annotateRecursive(parsed, evalResults);
    return JSON.stringify(annotated, null, 2);
  } catch {
    return compactJsonStr;
  }
};

