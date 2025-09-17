import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import { fetch } from "./router";
import type { Env } from "./types";

export { SyncBackendDO } from "./sync";
export { LiveStoreClientDO } from "./client";

export default {
  fetch,
} satisfies CfTypes.ExportedHandler<Env>;
