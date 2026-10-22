import { Schema } from "@livestore/livestore";
import { events, schema, tables } from "./default-schema";

import * as queries from "./default-queries";

// Commit the returned events together locally. LiveStore preserves their order
// when uploading them, without putting the entire history in one event.
// Keep the first message in TaskInited to preserve its pending-model status.
export function taskInitEvents(args: Parameters<typeof events.taskInited>[0]) {
  const { initMessages, ...task } = args;
  if (!initMessages?.length) return [events.taskInited(args)];

  const [firstMessage, ...remainingMessages] = initMessages;
  return [
    events.taskInited({ ...task, initMessages: [firstMessage] }),
    ...remainingMessages.map((data) =>
      events.messageUpserted({ taskId: task.id, data }),
    ),
  ];
}

export function forkTaskInitEvents(
  args: Parameters<typeof events.forkTaskInited>[0],
) {
  const { tasks, messages, files } = args;
  return [
    ...tasks.map((task) =>
      events.forkTaskInited({ tasks: [task], messages: [], files: [] }),
    ),
    ...messages.map(({ taskId, data }) =>
      events.messageUpserted({ taskId, data }),
    ),
    ...files.map((file) =>
      events.forkTaskInited({ tasks: [], messages: [], files: [file] }),
    ),
  ];
}

export type TaskEvent = Exclude<
  (typeof events)[keyof typeof events]["Event"],
  | typeof events.forkAgentLocalEvent.Event
  | typeof events.writeStoreFile.Event
  | typeof events._writeTaskFile.Event
  | typeof events._blobInserted.Event
  | typeof events.forkTaskInited.Event
>;

/** Apply the persistence policy to task and message events, not shared files. */
export function taskEvents(
  persistLocallyOnly: boolean,
  batch: ReadonlyArray<TaskEvent>,
) {
  if (!persistLocallyOnly) return batch;
  return batch.map(({ name, args }) => {
    const eventDef = schema.eventsDefsMap.get(name);
    if (!eventDef) throw new Error(`Unknown fork agent event: ${name}`);
    return events.forkAgentLocalEvent({
      name,
      args: Schema.encodeSync(eventDef.schema)(args),
    });
  });
}

export const defaultCatalog = {
  events,
  schema,
  tables,
  queries,
  taskInitEvents,
  taskEvents,
  forkTaskInitEvents,
};
