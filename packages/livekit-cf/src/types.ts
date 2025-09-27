import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import type * as SyncBackend from "@livestore/sync-cf/cf-worker";

export type Env = {
  CLIENT_DO: CfTypes.DurableObjectNamespace<ClientDoCallback>;
  SYNC_BACKEND_DO: CfTypes.DurableObjectNamespace<SyncBackend.SyncBackendRpcInterface>;
  ADMIN_SECRET: string;
  POCHI_API_KEY: string;
  ENVIRONMENT: "dev" | "prod" | undefined;
  ASSETS: CfTypes.Fetcher;
  WEBHOOK_URL?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  image: string;
  emailVerified: boolean;
};

export interface ClientDoCallback extends ClientDoWithRpcCallback {
  setOwner: (user: User) => Promise<void>;
  signalKeepAlive: (storeId: string) => Promise<void>;
}
