import { useEffect } from "react";
import { useLatest } from "./use-latest";

/** `MouseEvent.button` of the mouse "back" (fourth) button. */
const MouseBackButton = 3;

/**
 * Runs `onBack` instead of a history back when the mouse back button is
 * released inside the webview.
 *
 * VS Code webviews share the session history of the whole workbench window.
 * An entry created before this webview existed has no state for it, so a
 * history back can silently do nothing. Canceling the `mouseup` stops the
 * history back and lets the page navigate explicitly.
 */
export function useMouseBackButton(onBack: () => void) {
  const onBackRef = useLatest(onBack);

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== MouseBackButton) return;
      event.preventDefault();
      onBackRef.current();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [onBackRef]);
}
