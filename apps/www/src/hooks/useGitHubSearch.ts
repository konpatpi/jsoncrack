import React from "react";
import toast from "react-hot-toast";
import type { NodeData } from "jsoncrack-react";
import useGitHub from "../store/useGitHub";
import useFile from "../store/useFile";
import useJson from "../store/useJson";
import { applyPolicyTransform, hasPolicyConditions } from "../lib/utils/policyTransform";

// DEPRECATED: ใช้ config จาก policy store แทน
// const GITHUB_REPO = "corp-ais/sky-fbb-onboarding-common";
// const GITHUB_BRANCH = "master";

// Known folder structure: config/Policy/{folder}/{code}.json
const POLICY_FOLDER_MAP: Record<string, string> = {
  PLSE: "Set",
  PLGP: "Group",
  PLRL: "Rule",
};

// Detect policy type from code prefix
export const detectPolicyType = (value: string): string | null => {
  const upper = value.toUpperCase();
  if (upper.startsWith("PLSE")) return "Policy Set";
  if (upper.startsWith("PLGP")) return "Policy Group";
  if (upper.startsWith("PLRL")) return "Policy Rule";
  return null;
};

// Extract all policy codes from a node's text rows
export const extractPolicyCodes = (
  text: { key: string | null; value: string | number | null | boolean; type: string }[]
): string[] => {
  const codes: string[] = [];
  for (const row of text) {
    const strVal = row.value !== null && row.value !== undefined ? String(row.value) : "";
    const strKey = row.key ?? "";
    for (const s of [strVal, strKey]) {
      if (/^PL(SE|GP|RL)/i.test(s)) {
        codes.push(s);
      }
    }
  }
  return [...new Set(codes)];
};

interface GitHubFileContent {
  content: string; // base64
  encoding: string;
  name: string;
  path: string;
}

// Build the first candidate GitHub web URL for a policy code
export const buildGitHubWebUrl = (code: string, repo?: string, branch?: string): string => {
  const targetRepo = repo || "corp-ais/sky-fbb-onboarding-common";
  const targetBranch = branch || "master";
  const prefix = code.slice(0, 4).toUpperCase();
  const folder = POLICY_FOLDER_MAP[prefix];
  const filePath = folder
    ? `onboarding_activity/config/Policy/${folder}/${code}.json`
    : `onboarding_activity/config/Policy/${code}.json`;
  return `https://github.com/${targetRepo}/blob/${targetBranch}/${filePath}`;
};

const useGitHubSearch = () => {
  const token = useGitHub(state => state.token);
  const policyConfig = useGitHub(state => state.policyConfig);
  const setContents = useFile(state => state.setContents);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);
  const setOriginalJson = useJson(state => state.setOriginalJson);
  const [searching, setSearching] = React.useState(false);

  const headers = React.useMemo(
    () => ({
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  /** Try to fetch file content directly by a full path — returns file data or throws on auth errors */
  const tryFetchByPath = React.useCallback(
    async (repo: string, branch: string, path: string): Promise<GitHubFileContent | null> => {
      const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
      const res = await fetch(url, { headers });
      if (res.status === 401) throw new Error("unauthorized");
      if (res.status === 403) throw new Error("rate_limit");
      if (!res.ok) return null;
      const data = await res.json();
      // GitHub returns an array for directories — skip
      if (Array.isArray(data)) return null;
      return data as GitHubFileContent;
    },
    [headers]
  );

  /** Build candidate direct paths for a policy code */
  const buildCandidatePaths = (code: string, repoType: "activity" | "common"): string[] => {
    const prefix = code.slice(0, 4).toUpperCase();
    const folder = POLICY_FOLDER_MAP[prefix];
    const basePath = repoType === "activity" ? "onboarding_activity/config/Policy" : "onboarding_common/config/Policy";
    
    const paths: string[] = [];
    if (folder) {
      paths.push(`${basePath}/${folder}/${code}.json`);
    }
    paths.push(`${basePath}/${code}.json`);
    return paths;
  };

  /**
   * Merge resolved JSON into the current graph at the clicked node's path.
   * Adds a key named `code` to the object at that path.
   */
  const mergeIntoGraph = React.useCallback(
    (code: string, resolvedJson: unknown, node: NodeData): boolean => {
      try {
        const currentJson = getJson();
        const root = JSON.parse(currentJson);
        const path = node.path ?? [];

        // Navigate to the target object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let target: any = root;
        for (const segment of path) {
          if (target == null) return false;
          target = target[segment];
        }

        if (target == null || typeof target !== "object" || Array.isArray(target)) {
          return false;
        }

        // Inject the resolved JSON under the code key
        target[code] = resolvedJson;
        setJson(JSON.stringify(root, null, 2));
        return true;
      } catch {
        return false;
      }
    },
    [getJson, setJson]
  );

  const findAndLoad = React.useCallback(
    async (value: string, node?: NodeData) => {
      const policyType = detectPolicyType(value);
      if (!policyType) {
        toast.error(`"${value}" ไม่ตรงกับ pattern PLSE / PLGP / PLRL`);
        return;
      }

      if (!token) {
        toast.error("กรุณาตั้งค่า GitHub Token ก่อน (คลิกไอคอน GitHub ใน toolbar)");
        return;
      }

      if (!policyConfig.productLine || !policyConfig.activity) {
        toast.error("กรุณาตั้งค่า Product Line และ Activity ใน Policy Config ก่อน");
        return;
      }

      setSearching(true);
      const toastId = toast.loading(`กำลังค้นหา ${policyType}: ${value}...`);

      try {
        let fileData: GitHubFileContent | null = null;
        let source = "";

        // Strategy 1: Try activity repo first
        const activityPaths = buildCandidatePaths(value, "activity");
        console.log("[GitHubSearch] Activity Repo:", policyConfig.activity);
        console.log("[GitHubSearch] Activity Branch:", policyConfig.activityBranch);
        console.log("[GitHubSearch] Trying activity paths:", activityPaths);
        
        for (const path of activityPaths) {
          fileData = await tryFetchByPath(policyConfig.activity, policyConfig.activityBranch, path);
          if (fileData) {
            source = `${policyConfig.activity} (${policyConfig.activityBranch})`;
            console.log("[GitHubSearch] ✅ Found in activity repo:", path);
            break;
          }
        }

        // Strategy 2: Fallback to common repo
        if (!fileData) {
          const commonRepo = `corp-ais/sky-${policyConfig.productLine}-onboarding-common`;
          const commonBranch = policyConfig.commonBranch;
          const commonPaths = buildCandidatePaths(value, "common");
          
          console.log("[GitHubSearch] ❌ Not found in activity, trying common repo:", commonRepo);
          console.log("[GitHubSearch] Common Branch:", commonBranch);
          console.log("[GitHubSearch] Trying common paths:", commonPaths);
          
          for (const path of commonPaths) {
            fileData = await tryFetchByPath(commonRepo, commonBranch, path);
            if (fileData) {
              source = `${commonRepo} (${commonBranch})`;
              console.log("[GitHubSearch] ✅ Found in common repo:", path);
              break;
            }
          }
        }

        if (!fileData) {
          toast.error(
            `ไม่พบไฟล์ "${value}.json"\n\n` +
            `ค้นหาใน:\n` +
            `1. ${policyConfig.activity} (${policyConfig.activityBranch})\n` +
            `2. corp-ais/sky-${policyConfig.productLine}-onboarding-common (${policyConfig.commonBranch})\n\n` +
            `💡 ตรวจสอบ branch และ repo ใน Policy Config`,
            { id: toastId, duration: 6000 }
          );
          return;
        }

        if (fileData.encoding !== "base64") {
          toast.error("รูปแบบ encoding ไม่รองรับ", { id: toastId });
          return;
        }

        // Decode base64
        const decoded = atob(fileData.content.replace(/\s/g, ""));
        let parsedContent: unknown;
        try {
          parsedContent = JSON.parse(decoded);
        } catch {
          toast.error("เนื้อหาไฟล์ไม่ใช่ JSON ที่ถูกต้อง", { id: toastId });
          return;
        }

        const jsonContent = JSON.stringify(parsedContent, null, 2);

        // Always store original (pre-transform) JSON for NodeModal
        setOriginalJson(jsonContent);

        const finalContent = hasPolicyConditions(jsonContent)
          ? applyPolicyTransform(jsonContent)
          : jsonContent;
        const finalParsed = JSON.parse(finalContent);

        if (node) {
          // Merge: inject the resolved JSON into the current graph at the clicked node's path
          const merged = mergeIntoGraph(value, finalParsed, node);
          if (merged) {
            toast.success(`เชื่อมต่อ ${value} เข้ากับ node สำเร็จ\nจาก ${source}`, { id: toastId, duration: 3000 });
          } else {
            setContents({ contents: finalContent });
            toast.success(`โหลด ${policyType}: ${fileData.name} สำเร็จ (แสดงแทน)\nจาก ${source}`, { id: toastId });
          }
        } else {
          setContents({ contents: finalContent });
          toast.success(`โหลด ${policyType}: ${fileData.name} สำเร็จ\nจาก ${source}`, { id: toastId });
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.message === "rate_limit") {
            toast.error("GitHub API rate limit เกิน กรุณาลองใหม่ภายหลัง", { id: toastId });
          } else if (err.message === "unauthorized") {
            toast.error("GitHub Token ไม่ถูกต้องหรือหมดอายุแล้ว", { id: toastId });
          } else {
            toast.error("เกิดข้อผิดพลาด: " + err.message, { id: toastId });
          }
        } else {
          toast.error("เกิดข้อผิดพลาดในการค้นหา", { id: toastId });
        }
      } finally {
        setSearching(false);
      }
    },
    [token, policyConfig, tryFetchByPath, mergeIntoGraph, setContents, setOriginalJson]
  );

  return { findAndLoad, searching };
};

export default useGitHubSearch;
