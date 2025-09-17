import { persister, queryClient } from "@/lib/query-client";
import { catalog } from "@getpochi/livekit";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { LiveStoreProvider } from "@livestore/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { ThemeProvider } from "./components/theme-provider";
import { LiveStoreProvider as LiveStoreProviderWrapper } from "./livestore-provider";

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
