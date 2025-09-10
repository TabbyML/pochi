import { persister, queryClient } from "@/lib/query-client";
import { catalog, getStoreId } from "@getpochi/livekit";
import {
  makeInMemoryAdapter,
  makePersistedAdapter,
} from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider } from "@livestore/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useMemo, useRef } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { ThemeProvider } from "./components/theme-provider";
import { useCurrentWorkspace } from "./lib/hooks/use-current-workspace";
import { usePochiCredentials } from "./lib/hooks/use-pochi-credentials";
import LiveStoreWorker from "./livestore.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export const Providers: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => {
              const isSuccess = query.state.status === "success";

              const cacheQuery =
                query.queryKey[0] === "session" ||
                // Only persist tasks query page 1.
                (query.queryKey[0] === "tasks" && query.queryKey[1] === 1) ||
                query.queryKey[0] === "integrations" ||
                query.queryKey[0] === "tools" ||
                query.queryKey[0] === "mcpConnectTools" ||
                (query.queryKey[0] === "models" && !!query.queryKey[1]);

              return isSuccess && cacheQuery;
            },
          },
        }}
      >
        <LiveStoreProviderWrapper>{children}</LiveStoreProviderWrapper>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
};

function LiveStoreProviderWrapper({ children }: { children: React.ReactNode }) {
  const { data: cwd } = useCurrentWorkspace();
  const { jwt } = usePochiCredentials();
  const storeId = useMemo(
    () => (cwd ? getStoreId(cwd, jwt) : undefined),
    [cwd, jwt],
  );
  const syncPayloadRef = useRef({ jwt });
  useEffect(() => {
    syncPayloadRef.current.jwt = jwt;
  }, [jwt]);

  return (
    <LiveStoreProvider
      schema={catalog.schema}
      adapter={adapter}
      renderLoading={(_) => <></>}
      disableDevtools={true}
      batchUpdates={batchUpdates}
      syncPayload={syncPayloadRef.current}
      storeId={storeId}
    >
      {children}
    </LiveStoreProvider>
  );
}

const inMemoryAdapter = makeInMemoryAdapter();

export const ShareProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LiveStoreProvider
          schema={catalog.schema}
          adapter={inMemoryAdapter}
          renderLoading={(_) => <></>}
          batchUpdates={batchUpdates}
        >
          {children}
        </LiveStoreProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};
