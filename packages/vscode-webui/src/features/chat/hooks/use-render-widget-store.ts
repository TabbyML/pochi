import { create } from "zustand";
import {
  type RenderWidgetError,
  type RenderWidgetErrorKind,
  normalizeRenderWidgetError,
} from "../lib/render-widget-error";

interface RenderWidgetStoreState {
  widgetStates: Map<string, unknown>;
  widgetErrors: Map<string, RenderWidgetError>;
  setWidgetState: (toolCallId: string, state: unknown) => void;
  getWidgetState: (toolCallId: string) => unknown;
  setWidgetError: (
    toolCallId: string,
    error: string,
    kind?: RenderWidgetErrorKind,
  ) => void;
  getWidgetError: (toolCallId: string) => RenderWidgetError | undefined;
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
    setWidgetError: (toolCallId, error, kind) =>
      set((current) => {
        const widgetErrors = new Map(current.widgetErrors);
        widgetErrors.set(toolCallId, normalizeRenderWidgetError(error, kind));
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
