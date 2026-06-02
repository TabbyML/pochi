import { create } from "zustand";

interface RenderWidgetStoreState {
  widgetStates: Map<string, unknown>;
  setWidgetState: (toolCallId: string, state: unknown) => void;
  getWidgetState: (toolCallId: string) => unknown;
  clearWidgetState: (toolCallId: string) => void;
  clearAllWidgetStates: () => void;
}

export const useRenderWidgetStore = create<RenderWidgetStoreState>()(
  (set, get) => ({
    widgetStates: new Map(),
    setWidgetState: (toolCallId, state) =>
      set((current) => {
        const widgetStates = new Map(current.widgetStates);
        widgetStates.set(toolCallId, state);
        return { widgetStates };
      }),
    getWidgetState: (toolCallId) => get().widgetStates.get(toolCallId),
    clearWidgetState: (toolCallId) =>
      set((current) => {
        const widgetStates = new Map(current.widgetStates);
        widgetStates.delete(toolCallId);
        return { widgetStates };
      }),
    clearAllWidgetStates: () => set({ widgetStates: new Map() }),
  }),
);
