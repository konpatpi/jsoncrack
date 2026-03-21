import { create } from "zustand";

interface JsonActions {
  setJson: (json: string) => void;
  getJson: () => string;
  setOriginalJson: (json: string) => void;
  getOriginalJson: () => string;
  clear: () => void;
}

const initialStates = {
  json: "{}",
  originalJson: "{}",
  loading: true,
};

export type JsonStates = typeof initialStates;

const useJson = create<JsonStates & JsonActions>()((set, get) => ({
  ...initialStates,
  getJson: () => get().json,
  setJson: json => {
    set({ json, loading: false });
  },
  getOriginalJson: () => get().originalJson,
  setOriginalJson: json => {
    set({ originalJson: json });
  },
  clear: () => {
    set({ json: "", originalJson: "", loading: false });
  },
}));

export default useJson;
