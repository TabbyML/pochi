import "./style.css";

import "./vscode-default.css";
import "./vscode-dark.css";
import "./vscode-light.css";
import { catalog } from "@getpochi/livekit";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import {
  StoreRegistry,
  StoreRegistryProvider,
  useStore,
} from "@livestore/react";
import { Suspense, useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

const inMemoryAdapter = makeInMemoryAdapter();

export function VSCodeWebProvider({ children }: { children: React.ReactNode }) {
  const [storeRegistry] = useState(
    () => new StoreRegistry({ defaultOptions: { batchUpdates } }),
  );
  return (
    <StoreRegistryProvider storeRegistry={storeRegistry}>
      <Suspense fallback={null}>
        <VSCodeWebProviderContent>{children}</VSCodeWebProviderContent>
      </Suspense>
    </StoreRegistryProvider>
  );
}

function VSCodeWebProviderContent({ children }: { children: React.ReactNode }) {
  useStore({
    storeId: "in-memory",
    schema: catalog.schema,
    adapter: inMemoryAdapter,
  });
  return <>{children}</>;
}
