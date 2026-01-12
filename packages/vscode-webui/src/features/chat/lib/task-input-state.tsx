import { useCallback, useState } from "react";

/**
 * Global variable to temporarily preserve input state during Suspense.
 * This allows input typed in ChatToolBarSkeleton to be preserved when
 * the real ChatToolbar renders after Suspense resolves.
 */
let preservedTaskInput = "";

export function usePreservedTaskInput() {
  const [input, setInputInternal] = useState(() => preservedTaskInput);

  const setInput = useCallback((value: string) => {
    preservedTaskInput = value;
    setInputInternal(value);
  }, []);

  const getAndClear = useCallback(() => {
    const preserved = preservedTaskInput;
    preservedTaskInput = "";
    return preserved;
  }, []);

  return { input, setInput, getAndClear };
}
