import "./remote-web-worker";
import "./resolve-worker-asset";
import "./i18n/config";

import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "./styles.css";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
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
  defaultErrorComponent: ({ error }) => {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
        {/* eslint-disable i18next/no-literal-string */}
        <div className="flex max-w-md flex-col items-center text-center">
          <h1 className="mb-8 flex items-center gap-2 font-semibold text-2xl tracking-tight">
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle
                  className="size-5 shrink-0 cursor-help text-yellow-500"
                  strokeWidth={2}
                />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-md whitespace-pre-wrap break-words"
              >
                {error.message || String(error)}
              </TooltipContent>
            </Tooltip>
            <span>Something went wrong</span>
          </h1>
          <a
            href="command:workbench.action.reloadWindow"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-xl"
          >
            <RefreshCw className="size-4" />
            Reload Window
          </a>
        </div>
        {/* eslint-enable i18next/no-literal-string */}
      </div>
    );
  },
});

declare global {
  interface Window {
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

// In the "pane" webview, navigate to the task page on load.
// Avoid setting window.location.hash globally because other scripts may modify it.
if (window.POCHI_WEBVIEW_KIND === "pane") {
  const params = window.POCHI_TASK_PARAMS;
  if (params) {
    router.navigate({
      to: "/task",
      // Pass uid only, other params will be parsed after route
      search: { uid: params.uid },
    });
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

  return (
    <StrictMode>
      <RouterProvider router={router} context={{}} />
    </StrictMode>
  );
}

function App() {
  return (
    <Providers>
      <InnerApp />
    </Providers>
  );
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
