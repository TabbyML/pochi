import "./style.css";

import "./vscode-default.css";
import "./vscode-dark.css";
import "./vscode-light.css";
import { catalog } from "@getpochi/livekit";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { LiveStoreProvider } from "@livestore/react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";

const inMemoryAdapter = makeInMemoryAdapter();

export function VSCodeWebProvider({ children }: { children: React.ReactNode }) {
  return (
    <LiveStoreProvider
      schema={catalog.schema}
      adapter={inMemoryAdapter}
      renderLoading={(_) => <></>}
      batchUpdates={batchUpdates}
    >
      {children}
    </LiveStoreProvider>
  );
}
