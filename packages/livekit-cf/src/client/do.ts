import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";
import { catalog } from "@getpochi/livekit";
import {
  type ClientDoWithRpcCallback,
  createStoreDoPromise,
} from "@livestore/adapter-cloudflare";
import { type Store, type Unsubscribe, nanoid } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import { app } from "./app";
import type { Env as ClientEnv } from "./types";

// Scoped by storeId
export class LiveStoreClientDO
  extends DurableObject
  implements ClientDoWithRpcCallback
{
  private storeId: string | undefined;

  private cachedStore: Store<typeof catalog.schema> | undefined;
  private storeSubscription: Unsubscribe | undefined;

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      setStoreId: (storeId: string) => {
        this.storeId = storeId;
      },
      getStore: async () => {
        const store = await this.getStore();

        await this.subscribeToStore();
        return store;
      },
    } satisfies ClientEnv);
  }

  private async getStore() {
    if (this.cachedStore !== undefined) {
      return this.cachedStore;
    }

    const storeId = this.storeId;
    if (!storeId) {
      throw new Error("storeId is required");
    }

    const store = await createStoreDoPromise({
      schema: catalog.schema,
      storeId,
      clientId: "client-do",
      sessionId: nanoid(),
      durableObjectId: this.state.id.toString(),
      bindingName: "CLIENT_DO",
      storage: this.state.storage,
      syncBackendDurableObject: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(storeId),
      ),
      livePull: true,
    });

    this.cachedStore = store;

    return store;
  }

  private async subscribeToStore() {
    const store = await this.getStore();
    // Do whatever you like with the store here :)

    // Make sure to only subscribe once
    if (this.storeSubscription === undefined) {
      this.storeSubscription = store.subscribe(catalog.queries.tasks$, {
        onUpdate: (_tasks) => {
          // FIXME
        },
      });
    }

    // Make sure the DO stays alive
    await this.state.storage.setAlarm(Date.now() + 1000);
  }

  alarm(_alarmInfo?: AlarmInvocationInfo): void | Promise<void> {
    this.subscribeToStore();
  }

  async syncUpdateRpc(payload: unknown) {
    await handleSyncUpdateRpc(payload);
  }
}
