import { catalog } from "@getpochi/livekit";
import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";

makeWorker({
  schema: catalog.schema,
  sync: {
    backend: makeWsSync({ url: "http://localhost:8787" }),
  },
});
