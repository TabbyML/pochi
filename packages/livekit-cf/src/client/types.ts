import type { catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";

export type Env = {
  setStoreId: (storeId: string) => void;
  getStore: () => Promise<Store<typeof catalog.schema>>;
  ASSETS: CfTypes.Fetcher;
};
