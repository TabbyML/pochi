import { getSyncBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { makeWorker } from "@livestore/adapter-web/worker";
import { SyncBackend } from "@livestore/common";
import { makeWsSync } from "@livestore/sync-cf/client";
import { Effect, Stream, SubscriptionRef } from "@livestore/utils/effect";
import { z } from "zod/v4";

const Payload = z.object({
  jwt: z.string(),
});

const makeSyncBackend =
  // biome-ignore lint/suspicious/noExplicitAny: allowed
  (): SyncBackend.SyncBackendConstructor<any> => (args) =>
    Effect.gen(function* () {
      const { payload } = args;
      if (Payload.safeParse(payload).success) {
        const backend = yield* makeWsSync({ url: getSyncBaseUrl() })(args);
        return backend;
      }

      const isConnected = yield* SubscriptionRef.make(true);
      return SyncBackend.of({
        isConnected,
        connect: Effect.void,
        ping: Effect.void,
        supports: {
          pullPageInfoKnown: false,
          pullLive: false,
        },
        pull: () => Stream.empty,
        push: () => Effect.void,
        metadata: {
          name: "@getpochi/livekit-cf/none-sync",
          description: "Fake sync backend that do nothing",
        },
      });
    });

makeWorker({
  schema: catalog.schema,
  sync: {
    backend: makeSyncBackend(),
  },
});
