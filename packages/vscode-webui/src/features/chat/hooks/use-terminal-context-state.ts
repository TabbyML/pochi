import type { TerminalTextSelection } from "@getpochi/common/vscode-webui-bridge";
import { create } from "zustand";

/**
 * Accumulates terminal text selections that the user explicitly attaches to
 * the next outgoing message via the "Add to Chat" terminal context menu
 * action (pushed from the VS Code host). This is intentionally kept separate
 * from the implicit "currently selected terminal text" capture performed at
 * submit time (see `useActiveSelection` / `readTerminalSelection`).
 */
export interface TerminalContextState {
  selections: TerminalTextSelection[];
  addSelection: (selection: TerminalTextSelection) => void;
  removeSelection: (index: number) => void;
  clearSelections: () => void;
}

export const useTerminalContextState = create<TerminalContextState>()(
  (set) => ({
    selections: [],
    addSelection: (selection) =>
      set((state) => ({ selections: [...state.selections, selection] })),
    removeSelection: (index) =>
      set((state) => ({
        selections: state.selections.filter((_, i) => i !== index),
      })),
    clearSelections: () => set({ selections: [] }),
  }),
);
