import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";
import { schema, tables } from "@getpochi/livekit/catalog";
import {
  type ClientDoWithRpcCallback,
  createStoreDoPromise,
} from "@livestore/adapter-cloudflare";
import { type Store, type Unsubscribe, nanoid } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import { app } from "./app";

// Scoped by storeId
export class LiveStoreClientDO
  extends DurableObject
  implements ClientDoWithRpcCallback
{
  storeId: string | undefined;

  private cachedStore: Store<typeof schema> | undefined;
  private storeSubscription: Unsubscribe | undefined;

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      CLIENT_DO: this,
    });
  }

  async getStore() {
    if (this.cachedStore !== undefined) {
      return this.cachedStore;
    }

    const storeId = this.storeId;
    if (!storeId) {
      throw new Error("storeId is required");
    }

    const store = await createStoreDoPromise({
      schema,
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

  async subscribeToStore() {
    const store = await this.getStore();
    // Do whatever you like with the store here :)

    // Make sure to only subscribe once
    if (this.storeSubscription === undefined) {
      this.storeSubscription = store.subscribe(tables.tasks, {
        onUpdate: (todos) => {
          console.log(`todos for store (${this.storeId})`, todos);
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
