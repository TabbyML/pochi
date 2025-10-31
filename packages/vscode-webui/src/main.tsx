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
import { Loader2 } from "lucide-react";
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

function InnerApp() {
  const { isLoading } = useUserStorage();

  if (isLoading && isVSCodeEnvironment()) {
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
