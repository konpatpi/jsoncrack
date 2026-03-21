import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GitHubState {
  token: string;
}

interface GitHubActions {
  setToken: (token: string) => void;
  clearToken: () => void;
}

const initialStates: GitHubState = {
  token: "",
};

const useGitHub = create(
  persist<GitHubState & GitHubActions>(
    set => ({
      ...initialStates,
      setToken: token => set({ token: token.trim() }),
      clearToken: () => set({ token: "" }),
    }),
    {
      name: "github-config",
    }
  )
);

export default useGitHub;
