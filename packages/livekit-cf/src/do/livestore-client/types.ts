import type { User } from "@/types";
import type { catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";

export type Env = {
  getStore: () => Promise<Store<typeof catalog.schema>>;
  setStoreId: (storeId: string) => void;
  getUser: () => Promise<User | undefined>;
  ASSETS: CfTypes.Fetcher;
};

export type DeepWriteable<T> = {
  -readonly [P in keyof T]: DeepWriteable<T[P]>;
};
