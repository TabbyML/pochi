import type { BlobStore, LiveKitStore, Message } from "@getpochi/livekit";
import { catalog } from "@getpochi/livekit";
import type { ClientTools } from "@getpochi/tools";
import type { InferToolInput } from "ai";
import * as R from "remeda";

export async function inlineSubTask(
  store: LiveKitStore,
  message: Message,
): Promise<Message> {
  const partsWithSubtasks = message.parts.map((part) => {
    if (part.type === "tool-newTask" && part.state !== "input-streaming") {
      const input = part.input as InferToolInput<ClientTools["newTask"]>;
      const subtaskId = input._meta?.uid;
      if (subtaskId) {
        const subtask = store.query(catalog.queries.makeTaskQuery(subtaskId));
        const subtaskMessages = store.query(
          catalog.queries.makeMessagesQuery(subtaskId),
        );
        if (subtask) {
          return {
            ...part,
            input: {
              ...input,
              _transient: {
                task: {
                  clientTaskId: subtaskId,
                  messages: subtaskMessages.map((m) => m.data as Message),
                  todos: subtask.todos.map((t) => ({ ...t })),
                },
              },
            },
          };
        }
      }
    }
    return part;
  });
  return {
    ...message,
    parts: partsWithSubtasks,
  };
}

export async function mapStoreBlob(
  store: BlobStore,
  o: unknown,
): Promise<unknown> {
  if (R.isString(o) && o.startsWith(store.protocol)) {
    const blob = await store.get(o);
    if (!blob) throw new Error(`Store blob not found at "${o}"`);

    const base64 = Buffer.from(blob.data).toString("base64");
    return `data:${blob.mimeType};base64,${base64}`;
  }

  if (R.isArray(o)) {
    return Promise.all(o.map((el) => mapStoreBlob(store, el)));
  }

  if (R.isObjectType(o)) {
    const entires = await Promise.all(
      R.entries(o as Record<string, unknown>).map(
        async ([k, v]): Promise<[string, unknown]> => [
          k,
          await mapStoreBlob(store, v),
        ],
      ),
    );
    return R.fromEntries(entires);
  }

  return o;
}
