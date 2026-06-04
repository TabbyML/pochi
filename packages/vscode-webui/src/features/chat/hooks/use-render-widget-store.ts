import { create } from "zustand";

interface RenderWidgetStoreState {
  widgetStates: Map<string, unknown>;
  widgetErrors: Map<string, string>;
  setWidgetState: (toolCallId: string, state: unknown) => void;
  getWidgetState: (toolCallId: string) => unknown;
  setWidgetError: (toolCallId: string, error: string) => void;
  getWidgetError: (toolCallId: string) => string | undefined;
  clearWidgetError: (toolCallId: string) => void;
  clearWidgetState: (toolCallId: string) => void;
  clearAllWidgetStates: () => void;
}

export const useRenderWidgetStore = create<RenderWidgetStoreState>()(
  (set, get) => ({
    widgetStates: new Map(),
    widgetErrors: new Map(),
    setWidgetState: (toolCallId, state) =>
      set((current) => {
        const widgetStates = new Map(current.widgetStates);
        widgetStates.set(toolCallId, state);
        return { widgetStates };
      }),
    getWidgetState: (toolCallId) => get().widgetStates.get(toolCallId),
    setWidgetError: (toolCallId, error) =>
      set((current) => {
        const widgetErrors = new Map(current.widgetErrors);
        widgetErrors.set(toolCallId, error);
        return { widgetErrors };
      }),
    getWidgetError: (toolCallId) => get().widgetErrors.get(toolCallId),
    clearWidgetError: (toolCallId) =>
      set((current) => {
        const widgetErrors = new Map(current.widgetErrors);
        widgetErrors.delete(toolCallId);
        return { widgetErrors };
      }),
    clearWidgetState: (toolCallId) =>
      set((current) => {
        const widgetStates = new Map(current.widgetStates);
        const widgetErrors = new Map(current.widgetErrors);
        widgetStates.delete(toolCallId);
        widgetErrors.delete(toolCallId);
        return { widgetStates, widgetErrors };
      }),
    clearAllWidgetStates: () =>
      set({ widgetStates: new Map(), widgetErrors: new Map() }),
  }),
);
