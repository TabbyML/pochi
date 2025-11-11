import { Events, Schema, State, makeSchema } from "@livestore/livestore";
import * as catalog from "./default-schema";
import { taskFullFields } from "./types";

export const tables = {
  tasks: catalog.tables.tasks,
};

export const events = {
  tastUpdated: Events.synced({
    name: "v1.TaskUpdated",
    schema: Schema.Struct({
      ...taskFullFields,
    }),
  }),
};

const materializers = State.SQLite.materializers(events, {
  "v1.TaskUpdated": (task) => [
    tables.tasks.insert(task).onConflict("id", "replace"),
  ],
});

const state = State.SQLite.makeState({
  tables: tables,
  materializers: materializers,
});

export const schema = makeSchema({
  events,
  state,
});
