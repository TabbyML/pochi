import { type Message, StoreBlobProtocol, catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import * as R from "remeda";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export class JsonRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;

  constructor(
    private readonly store: Store,
    private readonly state: NodeChatState,
  ) {
    this.state.signal.messages.subscribe((messages) => {
      if (messages.length > this.lastMessageCount) {
        this.outputMessages(messages.slice(0, -1));
        this.lastMessageCount = messages.length;
      }
    });
  }

  shutdown() {
    this.outputMessages(this.state.signal.messages.value);
  }

  renderSubTask(_task: TaskRunner) {}

  private outputMessages(messages: Message[]) {
    for (const message of messages) {
      if (!this.outputMessageIds.has(message.id)) {
        console.log(JSON.stringify(mapStoreBlob(this.store, message)));
        this.outputMessageIds.add(message.id);
      }
    }
  }
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
