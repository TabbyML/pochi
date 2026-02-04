import { useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import { isVSCodeEnvironment } from "../vscode";

type NavigateFn = ReturnType<typeof useTanstackNavigate>;

const noopNavigate = (() => {}) as unknown as NavigateFn;

/**
 * Navigate hook that only works in VSCode webview environment.
 *
 * In VSCode webview: returns the real useNavigate() from TanStack Router.
 * In other environments (e.g., share page iframe): returns a no-op function.
 */
export function useNavigate(): NavigateFn {
  // biome-ignore lint/correctness/useHookAtTopLevel: isVSCodeEnvironment() is a constant determined at page load, hook order is stable
  return isVSCodeEnvironment() ? useTanstackNavigate() : noopNavigate;
}
