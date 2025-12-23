import { catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import type { Store } from "@livestore/livestore";
import { type ReactApi, storeOptions, useStore } from "@livestore/react";
import { createContext, useContext } from "react";
import LiveStoreWorker from "../livestore.default.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

function defaultStoreOptions(storeId: string, jwt: string | null) {
  return storeOptions({
    storeId,
    schema: catalog.schema,
    adapter,
    syncPayload: { jwt },
    disableDevtools: true,
  });
}

const DefaultStoreOptionsContext = createContext<ReturnType<
  typeof defaultStoreOptions
> | null>(null);

export function DefauleStoreOptionsProvider(props: {
  storeId: string;
  jwt: string | null;
  children: React.ReactNode;
}) {
  const options = defaultStoreOptions(props.storeId, props.jwt);
  return (
    <DefaultStoreOptionsContext.Provider value={options}>
      {props.children}
    </DefaultStoreOptionsContext.Provider>
  );
}

export function useDefaultStoreOptions() {
  return useContext(DefaultStoreOptionsContext);
}

export function useHasDefaultStoreOptions() {
  return useDefaultStoreOptions() !== null;
}

export function useDefaultStore(): Store<typeof catalog.schema> & ReactApi {
  const storeOptions = useDefaultStoreOptions();
  if (!storeOptions) {
    throw new Error(
      "useDefaultStore must be used within a ChatContextProvider with storeOptions or with storeId and jwt arguments",
    );
  }
  return useStore(storeOptions);
}
