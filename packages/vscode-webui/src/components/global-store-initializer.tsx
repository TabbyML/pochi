import { setBackgroundTaskStore } from "@/lib/background-task-service";
import { useDefaultStore } from "@/lib/use-default-store";
import { setGlobalStore } from "@/lib/vscode";
import { useEffect } from "react";

export function GlobalStoreInitializer() {
  const store = useDefaultStore();
  useEffect(() => {
    setGlobalStore(store);
    setBackgroundTaskStore(store);
    return () => {
      setGlobalStore(null);
      setBackgroundTaskStore(null);
    };
  }, [store]);
  return null;
}
