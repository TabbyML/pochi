import type { User } from "@/types";
import type { Task, catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";

export type Env = {
  getStore: () => Promise<Store<typeof catalog.schema>>;
  setStoreId: (storeId: string) => void;
  getOwner: () => Promise<User | undefined>;
  reloadShareTasks: () => Promise<readonly Task[] | undefined>;
  ASSETS: CfTypes.Fetcher;
};

export type DeepWritable<T> = {
  -readonly [P in keyof T]: DeepWritable<T[P]>;
};
