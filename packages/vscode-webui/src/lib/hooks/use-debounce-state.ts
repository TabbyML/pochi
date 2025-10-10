import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface UseDebouncedStateOptions {
  leading?: boolean;
}

export function useDebounceState<T>(
  defaultValue: T,
  wait: number,
  options: UseDebouncedStateOptions = { leading: false },
) {
  const [value, setValue] = useState(defaultValue);
  const timeoutRef = useRef<number | null>(null);
  const leadingRef = useRef(true);

  const clearTimeout = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => clearTimeout, [clearTimeout]);

  // biome-ignore lint/correctness/useExhaustiveDependencies(wait): do not recreate debouncedSetValue on wait change
  const debouncedSetValue = useCallback(
    (newValue: SetStateAction<T>) => {
      clearTimeout();
      if (leadingRef.current && options.leading) {
        setValue(newValue);
      } else {
        timeoutRef.current = window.setTimeout(() => {
          leadingRef.current = true;
          setValue(newValue);
        }, wait);
      }
      leadingRef.current = false;
    },
    [options.leading, clearTimeout],
  );

  return [value, debouncedSetValue, setValue] as const;
}
