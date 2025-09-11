import type { catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";

export type Env = {
  setStoreId: (storeId: string) => void;
  getStore: () => Promise<Store<typeof catalog.schema>>;
};
