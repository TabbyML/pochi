import "./style.css";

import "./vscode-default.css";
import "./vscode-dark.css";
import "./vscode-light.css";
import { DefaultStoreOptionsProvider } from "@/lib/use-default-store";
import { StoreRegistry, StoreRegistryProvider } from "@livestore/react";
import { Suspense, useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

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
  return (
    <DefaultStoreOptionsProvider type="share-page">
      {children}
    </DefaultStoreOptionsProvider>
  );
}
