import { create } from "zustand";
import { persist } from "zustand/middleware";

type ProductLine = "mpo" | "fbb" | "iot";
type FileType = "SPEC" | "CFS" | "RFS" | "GROUP" | "RULE" | "SET";

interface PolicyConfig {
  productLine: ProductLine | null;
  activity: string | null;
  activityBranch: string;
  commonBranch: string;
  fileType: FileType | null;
  searchText: string;
}

interface GitHubState {
  token: string;
  policyConfig: PolicyConfig;
}

interface GitHubActions {
  setToken: (token: string) => void;
  clearToken: () => void;
  setPolicyConfig: (config: PolicyConfig) => void;
  clearPolicyConfig: () => void;
}

const initialStates: GitHubState = {
  token: "",
  policyConfig: {
    productLine: null,
    activity: null,
    activityBranch: "develop",
    commonBranch: "develop",
    fileType: null,
    searchText: "",
  },
};

const useGitHub = create(
  persist<GitHubState & GitHubActions>(
    set => ({
      ...initialStates,
      setToken: token => set({ token: token.trim() }),
      clearToken: () => set({ token: "" }),
      setPolicyConfig: config => set({ policyConfig: config }),
      clearPolicyConfig: () => set({ 
        policyConfig: {
          productLine: null,
          activity: null,
          activityBranch: "develop",
          commonBranch: "develop",
          fileType: null,
          searchText: "",
        }
      }),
    }),
    {
      name: "github-config",
    }
  )
);

export default useGitHub;
