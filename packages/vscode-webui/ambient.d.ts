import type {
  makeInMemoryAdapter,
  makePersistedAdapter,
} from "@livestore/adapter-web";

declare global {
  var POCHI_WEBVIEW_KIND: "sidebar" | "pane";
  var POCHI_LIVEKIT_ADAPTER:
    | ReturnType<typeof makePersistedAdapter>
    | ReturnType<typeof makeInMemoryAdapter>
    | undefined;
}
