import React from "react";
import toast from "react-hot-toast";
import type { NodeData } from "jsoncrack-react";
import useGitHub from "../store/useGitHub";
import useFile from "../store/useFile";
import useJson from "../store/useJson";
import { applyPolicyTransform, hasPolicyConditions } from "../lib/utils/policyTransform";

const GITHUB_REPO = "corp-ais/sky-fbb-onboarding-common";
const GITHUB_BRANCH = "master";

// Known folder structure: config/Policy/{folder}/{code}.json
// Some repos have a root-level prefix folder
const POLICY_FOLDER_MAP: Record<string, string> = {
  PLSE: "Set",
  PLGP: "Group",
  PLRL: "Rule",
};

// Candidate base paths to try (in order)
const BASE_PATHS = [
  "onboarding_common/config/Policy",
  "config/Policy",
  "policy",
  "policies",
  "",
];

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

interface GitHubSearchResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: { full_name: string };
}

interface GitHubFileContent {
  content: string; // base64
  encoding: string;
  name: string;
  path: string;
}

// Build the first candidate GitHub web URL for a policy code
export const buildGitHubWebUrl = (code: string): string => {
  const prefix = code.slice(0, 4).toUpperCase();
  const folder = POLICY_FOLDER_MAP[prefix];
  const filePath = folder
    ? `${BASE_PATHS[0]}/${folder}/${code}.json`
    : `${BASE_PATHS[0]}/${code}.json`;
  return `https://github.com/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${filePath}`;
};

const useGitHubSearch = () => {
  const token = useGitHub(state => state.token);
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
    async (path: string): Promise<GitHubFileContent | null> => {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`;
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
  const buildCandidatePaths = (code: string): string[] => {
    const prefix = code.slice(0, 4).toUpperCase();
    const folder = POLICY_FOLDER_MAP[prefix];
    const paths: string[] = [];
    for (const base of BASE_PATHS) {
      if (folder) {
        paths.push(
          base ? `${base}/${folder}/${code}.json` : `${folder}/${code}.json`
        );
      }
      // Also try without the type subfolder
      paths.push(base ? `${base}/${code}.json` : `${code}.json`);
    }
    return paths;
  };

  const searchByFilename = React.useCallback(
    async (code: string): Promise<GitHubFileContent | null> => {
      const q = `filename:${code}.json+repo:${GITHUB_REPO}`;
      const searchUrl = `https://api.github.com/search/code?q=${q}&per_page=5`;
      const res = await fetch(searchUrl, { headers });
      if (!res.ok) {
        if (res.status === 403) throw new Error("rate_limit");
        if (res.status === 401) throw new Error("unauthorized");
        return null;
      }
      const data = (await res.json()) as { total_count: number; items: GitHubSearchResult[] };
      if (!data.items?.length) return null;

      // Prefer exact filename match
      const match =
        data.items.find(
          item => item.name.toUpperCase() === `${code.toUpperCase()}.json`
        ) ?? data.items[0];

      return tryFetchByPath(match.path);
    },
    [headers, tryFetchByPath]
  );

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

      setSearching(true);
      const toastId = toast.loading(`กำลังค้นหา ${policyType}: ${value}...`);

      try {
        let fileData: GitHubFileContent | null = null;

        // Strategy 1: try known direct paths (fastest, no rate-limit cost)
        const candidates = buildCandidatePaths(value);
        console.log("[GitHubSearch] Trying direct paths:", candidates);
        for (const path of candidates) {
          fileData = await tryFetchByPath(path);
          if (fileData) {
            console.log("[GitHubSearch] Found at:", path);
            break;
          }
        }

        // Strategy 2: filename search via GitHub Search API
        if (!fileData) {
          console.log("[GitHubSearch] Direct paths failed, trying filename search...");
          fileData = await searchByFilename(value);
        }

        if (!fileData) {
          toast.error(
            `ไม่พบไฟล์ "${value}.json" ใน repo\nช่องทางที่ลอง: ${candidates[0]}`,
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
            toast.success(`เชื่อมต่อ ${value} เข้ากับ node สำเร็จ`, { id: toastId, duration: 3000 });
          } else {
            setContents({ contents: finalContent });
            toast.success(`โหลด ${policyType}: ${fileData.name} สำเร็จ (แสดงแทน)`, { id: toastId });
          }
        } else {
          setContents({ contents: finalContent });
          toast.success(`โหลด ${policyType}: ${fileData.name} สำเร็จ`, { id: toastId });
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
    [token, tryFetchByPath, searchByFilename, mergeIntoGraph, setContents, setOriginalJson]
  );

  return { findAndLoad, searching };
};

export default useGitHubSearch;
