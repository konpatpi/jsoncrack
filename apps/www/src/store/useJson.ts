import { create } from "zustand";

interface JsonActions {
  setJson: (json: string) => void;
  getJson: () => string;
  setOriginalJson: (json: string) => void;
  getOriginalJson: () => string;
  setEvalJson: (json: string) => void;
  clearEvalJson: () => void;
  clear: () => void;
}

const initialStates = {
  json: "{}",
  originalJson: "{}",
  evalJson: null as string | null,
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
  setEvalJson: evalJson => set({ evalJson }),
  clearEvalJson: () => set({ evalJson: null }),
  clear: () => {
    set({ json: "", originalJson: "", evalJson: null, loading: false });
  },
}));

export default useJson;
