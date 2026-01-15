import { catalog } from "@getpochi/livekit";
import {
  makeInMemoryAdapter,
  makePersistedAdapter,
} from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import type { Store } from "@livestore/livestore";
import { type ReactApi, storeOptions, useStore } from "@livestore/react";
import type React from "react";
import { createContext, useContext } from "react";
import LiveStoreWorker from "../livestore.default.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

const inMemoryAdapter = makeInMemoryAdapter();

type DefaultStoreOptionsProviderProps = {
  children: React.ReactNode;
} & (
  | {
      type: "share-page";
    }
  | {
      type?: "vscode";
      storeId: string;
      jwt: string | null;
    }
);

function defaultStoreOptions(props: DefaultStoreOptionsProviderProps) {
  if (props.type === "share-page") {
    return storeOptions({
      storeId: "share-page",
      schema: catalog.schema,
      adapter: inMemoryAdapter,
      disableDevtools: true,
    });
  }
  return storeOptions({
    storeId: props.storeId,
    schema: catalog.schema,
    adapter,
    syncPayload: { jwt: props.jwt },
    disableDevtools: true,
  });
}
const DefaultStoreOptionsContext = createContext<ReturnType<
  typeof defaultStoreOptions
> | null>(null);

export const DefaultStoreOptionsProvider: React.FC<
  DefaultStoreOptionsProviderProps
> = (props) => {
  return (
    <DefaultStoreOptionsContext.Provider value={defaultStoreOptions(props)}>
      {props.children}
    </DefaultStoreOptionsContext.Provider>
  );
};

export function useDefaultStore(): Store<typeof catalog.schema> & ReactApi {
  const storeOptions = useContext(DefaultStoreOptionsContext);
  if (!storeOptions) {
    throw new Error(
      "useDefaultStore must be used within a ChatContextProvider with storeOptions or with storeId and jwt arguments",
    );
  }
  return useStore(storeOptions);
}
