import {
  events,
  schema,
  // tables
} from "./default-schema";

import * as queries from "./default-queries";

export const defaultCatalog = {
  events,
  schema,
  queries,
};

import * as taskQueries from "./task-queries";
import { events as taskEvents, schema as taskSchema } from "./task-schema";

export const taskCatalog = {
  events: taskEvents,
  schema: taskSchema,
  queries: taskQueries,
};
