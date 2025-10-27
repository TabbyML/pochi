import { taskCatalog } from "@getpochi/livekit";
import { makeWorker } from "@livestore/adapter-web/worker";

makeWorker({
  schema: taskCatalog.schema,
});
