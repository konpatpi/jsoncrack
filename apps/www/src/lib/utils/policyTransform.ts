// Policy Condition Compact Transform
// Converts deeply nested policyCondition arrays into a compact, readable representation:
// policyVariable [operator] policyValue

interface PolicyVariable {
  displayVariable?: string | null;
  source?: string | null;
}

interface PolicyOperator {
  name?: string | null;
}

interface PolicyValue {
  name?: string | null;
  valueType?: string | null;
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

const formatVariable = (v: PolicyVariable | null | undefined): string => {
  return v?.displayVariable ?? v?.source ?? "?";
};

const formatOperator = (op: PolicyOperator | null | undefined): string => {
  const name = op?.name ?? "?";
  // Compact symbols
  switch (name.toLowerCase()) {
    case "equals": return "=";
    case "not equals": return "≠";
    case "greater than": return ">";
    case "less than": return "<";
    case "greater than or equals": return "≥";
    case "less than or equals": return "≤";
    case "contains": return "contains";
    case "not contains": return "not contains";
    case "in": return "in";
    case "not in": return "not in";
    case "starts with": return "startsWith";
    case "ends with": return "endsWith";
    case "is null": return "= null";
    case "is not null": return "≠ null";
    default: return name;
  }
};

const formatValue = (v: PolicyValue | null | undefined): string => {
  if (!v) return "?";
  if (v.valueType === "null") return "null";
  if (v.name !== null && v.name !== undefined) return `"${v.name}"`;
  return v.valueType ?? "?";
};

const formatConditionLine = (stmt: PolicyConditionStatement): string => {
  const variable = formatVariable(stmt.policyVariable);
  const operator = formatOperator(stmt.policyOperator);
  const value = formatValue(stmt.policyValue);
  return `${variable} ${operator} ${value}`;
};

/** Compact a single policyCondition array into grouped, readable representation */
export const compactConditionArray = (conditions: PolicyCondition[]): Record<string, string[]> | string[] => {
  // Group by conditionGroupNumber
  const groups = new Map<number, PolicyCondition[]>();
  for (const c of conditions) {
    const gNum = c.conditionGroupNumber ?? 1;
    if (!groups.has(gNum)) groups.set(gNum, []);
    groups.get(gNum)!.push(c);
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);

  const toLine = (c: PolicyCondition): string => {
    if (c.policyConditionStatement) {
      return formatConditionLine(c.policyConditionStatement);
    }
    return c.name ?? c.id ?? "?";
  };

  // Single group → flat array
  if (sortedGroups.length === 1) {
    return sortedGroups[0][1].map(toLine);
  }

  // Multiple groups → object with group keys (AND within, OR between)
  const result: Record<string, string[]> = {};
  for (const [gNum, conds] of sortedGroups) {
    const logic = conds[0]?.isCNF !== false ? "AND" : "OR";
    result[`Group ${gNum} (${logic})`] = conds.map(toLine);
  }
  return result;
};

/** Recursively traverse any JSON object and compact all policyCondition arrays */
export const compactPolicyConditions = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return (value as unknown[]).map(compactPolicyConditions);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (key === "policyCondition" && Array.isArray(val) && val.length > 0) {
      // Check it looks like a policy condition array (has policyConditionStatement)
      const firstItem = val[0] as Record<string, unknown>;
      if ("policyConditionStatement" in firstItem || "conditionGroupNumber" in firstItem) {
        result[key] = compactConditionArray(val as PolicyCondition[]);
        continue;
      }
    }
    if (key === "policyActionStatement" && val !== null && typeof val === "object" && !Array.isArray(val)) {
      // Keep only policyValue — policyVariable and policyOperator are stripped from graph display
      const stmt = val as Record<string, unknown>;
      result[key] = stmt["policyValue"] !== undefined
        ? { policyValue: stmt["policyValue"] }
        : {};
      continue;
    }
    result[key] = compactPolicyConditions(val);
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

/** Detect if a JSON string needs policy transform (policyCondition or policyActionStatement) */
export const hasPolicyConditions = (jsonStr: string): boolean => {
  return jsonStr.includes('"policyCondition"') || jsonStr.includes('"policyActionStatement"');
};
