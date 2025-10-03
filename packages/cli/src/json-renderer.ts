import { StoreBlobProtocol, catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import * as R from "remeda";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export class JsonRenderer {
  private pendingMessageId = "";
  constructor(
    store: Store,
    private readonly state: NodeChatState,
  ) {
    this.state.signal.messages.subscribe((messages) => {
      const pendingMessageIndex = messages.findIndex(
        (message) => message.id === this.pendingMessageId,
      );

      const pendingMessages = messages.slice(pendingMessageIndex);
      for (const message of pendingMessages) {
        console.log(JSON.stringify(mapStoreBlob(store, message)));
      }
    });
  }

  shutdown() {}

  renderSubTask(_task: TaskRunner) {}
}

function mapStoreBlob(store: Store, o: unknown): unknown {
  if (R.isString(o) && o.startsWith(StoreBlobProtocol)) {
    const url = new URL(o);
    const blob = store.query(catalog.queries.makeBlobQuery(url.pathname));
    if (!blob) throw new Error(`Store blob not found at "${url.pathname}"`);
    return Buffer.from(blob.data).toString("base64");
  }

  if (R.isArray(o)) {
    return o.map((el) => mapStoreBlob(store, el));
  }

  if (R.isObjectType(o)) {
    return R.mapValues(o, (v) => mapStoreBlob(store, v));
  }

  return o;
}
