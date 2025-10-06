import { DurableObject } from "cloudflare:workers";
import { WebhookDelivery } from "@/lib/webhook-delivery";
import type { ClientDoCallback, Env, User } from "@/types";
import { catalog } from "@getpochi/livekit";
import { createStoreDoPromise } from "@livestore/adapter-cloudflare";
import { type Store, nanoid } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import type { CfTypes } from "@livestore/sync-cf/common";
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
      forceUpdateTasks: async () => {
        return (await this.onTasksUpdate(true)) || 0;
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
      durableObject: {
        ctx: this.ctx as CfTypes.DurableObjectState,
        env: this.env,
        bindingName: "CLIENT_DO",
      },
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
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

  private onTasksUpdate = async (force?: boolean) => {
    const store = await this.getStore();
    const tasks = store.query(catalog.queries.tasks$);
    const oneMinuteAgo = moment().subtract(1, "minute");

    const updatedTasks = tasks.filter(
      (task) => force || moment(task.updatedAt).isAfter(oneMinuteAgo),
    );

    if (!updatedTasks.length) return;

    updatedTasks.map((task) => {
      if (!task.shareId) {
        store.commit(
          catalog.events.updateShareId({
            id: task.id,
            shareId: `p-${task.id.replaceAll("-", "")}`,
            updatedAt: new Date(),
          }),
        );
      }
    });

    const { webhook } = this;
    if (webhook) {
      await Promise.all(
        updatedTasks.map((task) =>
          webhook.onTaskUpdated(task).catch(console.error),
        ),
      );
    }

    return updatedTasks.length;
  };
}
