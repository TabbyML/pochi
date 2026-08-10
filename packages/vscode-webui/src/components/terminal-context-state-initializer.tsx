import { useTerminalContextState } from "@/features/chat";
import { setAddTerminalContext } from "@/lib/vscode";
import { useEffect } from "react";

/**
 * Resolves the placeholder registered in `@/lib/vscode` with the actual
 * `useTerminalContextState` store once the React tree has mounted.
 *
 * `useTerminalContextState` lives in "@/features/chat", which transitively
 * imports "@/lib/vscode". Importing it eagerly at the top of "@/lib/vscode"
 * (a module that is evaluated very early, before React initializes) creates
 * an import cycle that can leave other modules partially initialized. To
 * avoid that, "@/lib/vscode" only keeps a placeholder function that is
 * resolved here, from within the React tree.
 */
export function TerminalContextStateInitializer() {
  useEffect(() => {
    setAddTerminalContext(useTerminalContextState.getState().addSelection);
    return () => {
      setAddTerminalContext(null);
    };
  }, []);

  return null;
}
