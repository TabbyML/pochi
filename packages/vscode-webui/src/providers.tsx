import { persister, queryClient } from "@/lib/query-client";
import { StoreRegistry, StoreRegistryProvider } from "@livestore/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { ThemeProvider } from "./components/theme-provider";

export const Providers: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [storeRegistry] = useState(
    () => new StoreRegistry({ defaultOptions: { batchUpdates } }),
  );

  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
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
                  query.queryKey[0] === "mcpConnectTools" ||
                  query.queryKey[0] === "thirdPartyMcpConfigs";

                return isSuccess && cacheQuery;
              },
            },
          }}
        >
          {children}
        </PersistQueryClientProvider>
      </ThemeProvider>
    </StoreRegistryProvider>
  );
};

export const ShareProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
};
