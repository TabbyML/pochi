import type { Message } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import * as R from "remeda";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export class JsonRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;

  constructor(
    private readonly store: Store,
    private readonly state: NodeChatState,
  ) {
    this.state.signal.messages.subscribe(
      runExclusive.build(async (messages) => {
        if (messages.length > this.lastMessageCount) {
          await this.outputMessages(messages.slice(0, -1));
          this.lastMessageCount = messages.length;
        }
      }),
    );
  }

  async shutdown() {
    await this.outputMessages(this.state.signal.messages.value);
  }

  renderSubTask(_task: TaskRunner) {}

  private async outputMessages(messages: Message[]) {
    for (const message of messages) {
      if (!this.outputMessageIds.has(message.id)) {
        console.log(JSON.stringify(await mapStoreBlob(this.store, message)));
        this.outputMessageIds.add(message.id);
      }
    }
  }
}

async function mapStoreBlob(store: Store, o: unknown): Promise<unknown> {
  if (R.isString(o) && o.startsWith("https://")) {
    const url = new URL(o);
    const blob = await fetch(url)
      .then((x) => x.blob())
      .then((x) => x.arrayBuffer());
    if (!blob) throw new Error(`Store blob not found at "${url.pathname}"`);
    const base64 = Buffer.from(blob).toString("base64");
    return `data:;base64,${base64}`;
  }

  if (R.isArray(o)) {
    return o.map((el) => mapStoreBlob(store, el));
  }

  if (R.isObjectType(o)) {
    return R.mapValues(o, (v) => mapStoreBlob(store, v));
  }

  return o;
}
