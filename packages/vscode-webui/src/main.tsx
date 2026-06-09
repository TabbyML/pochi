import "./remote-web-worker";
import "./resolve-worker-asset";
import "./i18n/config";

import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { Fragment, type ReactNode, StrictMode } from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "./styles.css";
import { Loader2 } from "lucide-react";
import { RouterErrorBoundary } from "./components/router-error-boundary";
import { useUserStorage } from "./lib/hooks/use-user-storage.ts";
import { isVSCodeEnvironment, vscodeHost } from "./lib/vscode";
import { Providers } from "./providers.tsx";
import reportWebVitals from "./reportWebVitals.ts";

const hashHistory = createHashHistory();

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  history: hashHistory,
  defaultErrorComponent: ({ error }) => <RouterErrorBoundary error={error} />,
});

declare global {
  interface Window {
    __liveStoreSharedWorkerUrl?: string;
    router: typeof router;
  }
}

window.router = router;

vscodeHost.getSessionState(["lastVisitedRoute"]).then((sessionState) => {
  if (sessionState.lastVisitedRoute) {
    router.navigate({ to: sessionState.lastVisitedRoute, replace: true });
  }
});

router.subscribe("onRendered", ({ toLocation }) => {
  vscodeHost.setSessionState({
    lastVisitedRoute: toLocation.pathname + toLocation.searchStr,
  });
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// In the "pane" webview, navigate to the panel page on load.
// Avoid setting window.location.hash globally because other scripts may modify it.
if (window.POCHI_WEBVIEW_KIND === "pane") {
  const panelInfo = window.POCHI_PANEL_INFO;
  switch (panelInfo?.type) {
    case "standalone":
      router.navigate({
        to: panelInfo.payload.route,
        replace: true,
      });
      break;
    case "task":
      router.navigate({
        to: "/task",
        // Pass uid only, other params will be parsed after route
        search: { uid: panelInfo.payload.task.uid },
      });
      break;
  }
}

function InnerApp() {
  const { isLoading } = useUserStorage();

  if (isLoading && isVSCodeEnvironment()) {
    if (window.POCHI_WEBVIEW_KIND === "pane") {
      return null;
    }
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return <RouterProvider router={router} context={{}} />;
}

function App() {
  return (
    <Providers>
      <InnerApp />
    </Providers>
  );
}

function StrictModeBoundary({ children }: { children: ReactNode }) {
  // React dev StrictMode replays effects. In the VS Code webview those effects
  // can start host-backed streams, so dev should match the production runtime.
  const Component =
    import.meta.env.DEV && globalThis.POCHI_WEBVIEW_KIND
      ? Fragment
      : StrictMode;
  return <Component>{children}</Component>;
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictModeBoundary>
      <App />
    </StrictModeBoundary>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
