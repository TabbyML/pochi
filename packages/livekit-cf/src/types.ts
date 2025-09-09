import type { ClientDoWithRpcCallback } from "@livestore/adapter-cloudflare";
import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import type * as SyncBackend from "@livestore/sync-cf/cf-worker";

export type Env = {
  CLIENT_DO: CfTypes.DurableObjectNamespace<ClientDoWithRpcCallback>;
  SYNC_BACKEND_DO: CfTypes.DurableObjectNamespace<SyncBackend.SyncBackendRpcInterface>;
  DB: D1Database;
  ADMIN_SECRET: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};
