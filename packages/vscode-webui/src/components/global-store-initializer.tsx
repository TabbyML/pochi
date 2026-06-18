import { useDefaultStore } from "@/lib/use-default-store";
import { setGlobalStore } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { useEffect } from "react";

const liveStoreLogger = getLogger("LiveStore");

export function GlobalStoreInitializer() {
  const store = useDefaultStore();

  useEffect(() => {
    setGlobalStore(store);
    return () => {
      setGlobalStore(null);
    };
  }, [store]);

  useEffect(() => {
    let active = true;
    const stream = async () => {
      try {
        const events = store.events();
        for await (const event of events) {
          if (!active) {
            break;
          }
          liveStoreLogger.debug(event);
        }
      } catch (error) {
        console.error("Failed to stream LiveStore events:", error);
      }
    };

    stream();

    return () => {
      active = false;
    };
  }, [store]);

  return null;
}
