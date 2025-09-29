import { DurableObject } from "cloudflare:workers";
import { getServerBaseUrl } from "@/lib/server";
import { WebhookDelivery } from "@/lib/webhook-delivery";
import type { ClientDoCallback, Env, User } from "@/types";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { type Task, catalog } from "@getpochi/livekit";
import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import { type Store, nanoid } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import { hc } from "hono/client";
import moment from "moment";
import { funnel } from "remeda";
import * as runExclusive from "run-exclusive";
import { app } from "./app";
import type { Env as ClientEnv } from "./types";

// Scoped by storeId
export class LiveStoreClientDO
  extends DurableObject
  implements ClientDoCallback
{
  private storeId: string | undefined;

  private cachedStore: Store<typeof catalog.schema> | undefined;
  private webhook: WebhookDelivery | undefined;
  // private storeSubscription: Unsubscribe | undefined;

  constructor(
    readonly state: DurableObjectState,
    readonly env: Env,
  ) {
    super(state, env);

    this.onTasksUpdate = runExclusive.buildMethod(this.onTasksUpdate);
  }

  async setOwner(user: User): Promise<void> {
    await this.state.storage.put("user", user);
  }

  async signalKeepAlive(storeId: string): Promise<void> {
    this.storeId = storeId;
    if (this.env.WEBHOOK_URL && !this.webhook) {
      this.webhook = new WebhookDelivery(this.storeId, this.env.WEBHOOK_URL);
    }

    await this.onTasksUpdateThrottled.call();
    await this.state.storage.setAlarm(Date.now() + 15_000);
    // await this.subscribeToStore();
  }

  async fetch(request: Request): Promise<Response> {
    return app.fetch(request, {
      getStore: async () => {
        return this.getStore();
      },
      getOwner: async () => {
        return await this.state.storage.get<User>("user");
      },
      setStoreId: (storeId: string) => {
        this.storeId = storeId;
      },
      ASSETS: this.env.ASSETS,
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

  // private async subscribeToStoreUpdates() {
  //   const store = await this.getStore();
  //   // Make sure to only subscribe once
  //   if (this.storeSubscription === undefined) {
  //     this.storeSubscription = store.subscribe(catalog.queries.tasks$, {
  //       // FIXME(meng): implement this with store.events stream when it's ready
  //       onUpdate: (tasks) => this.onTasksUpdateThrottled.call(tasks),
  //     });
  //   }
  // }

  alarm(_alarmInfo?: AlarmInvocationInfo): void | Promise<void> {}

  async syncUpdateRpc(payload: unknown) {
    await handleSyncUpdateRpc(payload);
  }

  private onTasksUpdateThrottled = funnel(async () => this.onTasksUpdate(), {
    minGapMs: 5_000,
    triggerAt: "both",
  });

  private onTasksUpdate = async () => {
    const store = await this.getStore();
    const tasks = store.query(catalog.queries.tasks$);
    const oneMinuteAgo = moment().subtract(1, "minute");

    const updatedTasks = tasks.filter((task) =>
      moment(task.updatedAt).isAfter(oneMinuteAgo),
    );

    if (!updatedTasks.length) return;

    // FIXME(kweizh): Migrate to webhook.
    await Promise.all(
      updatedTasks.map((task) =>
        this.persistTask(store, task).catch(console.error),
      ),
    );

    const { webhook } = this;
    if (webhook) {
      await Promise.all(
        updatedTasks.map((task) =>
          webhook.onTaskUpdated(task).catch(console.error),
        ),
      );
    }
  };

  private async persistTask(store: Store<typeof catalog.schema>, task: Task) {
    const { sub: userId } = decodeStoreId(store.storeId);
    const apiClient = createApiClient(
      this.env.ENVIRONMENT,
      this.env.POCHI_API_KEY,
      userId,
    );

    const resp = await apiClient.api.chat.persist.$post({
      json: {
        id: task.id,
        status: task.status,
        parentClientTaskId: task.parentId || undefined,
        storeId: store.storeId,
        clientTaskData: task,
      },
    });

    if (resp.status !== 200) {
      console.error(`Failed to persist chat: ${resp.statusText}`);
      return;
    }

    const { shareId } = await resp.json();
    if (!task.shareId) {
      store.commit(
        catalog.events.updateShareId({
          id: task.id,
          shareId,
          updatedAt: new Date(),
        }),
      );
    }
  }
}

function createApiClient(
  env: Env["ENVIRONMENT"],
  apiKey: string,
  userId: string,
): PochiApiClient {
  const prodServerUrl = getServerBaseUrl(env);
  return hc<PochiApi>(prodServerUrl, {
    headers: {
      authorization: `${apiKey},${userId}`,
    },
  });
}
