import { useDefaultStore } from "@/lib/use-default-store";
import { setGlobalStore } from "@/lib/vscode";
import { useEffect } from "react";

export function GlobalStoreInitializer() {
  const store = useDefaultStore();
  useEffect(() => {
    setGlobalStore(store);
    return () => setGlobalStore(null);
  }, [store]);
  return null;
}
