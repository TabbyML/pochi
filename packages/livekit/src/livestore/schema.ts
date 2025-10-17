import { Events, Schema, State, makeSchema } from "@livestore/livestore";

const DBTextUIPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  state: Schema.optional(Schema.Literal("streaming", "done")),
});

const DBUIPart = Schema.Union(DBTextUIPart, Schema.Unknown);

const DBMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal("user", "assistant", "system"),
  parts: Schema.Array(DBUIPart),
});

const Todo = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  status: Schema.Literal("pending", "in-progress", "completed", "cancelled"),
  priority: Schema.Literal("low", "medium", "high"),
});

const Todos = Schema.Array(Todo);

const TaskStatus = Schema.Literal(
  "completed",
  "pending-input",
  "failed",
  "pending-tool",
  "pending-model",
);

const TaskError = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("InternalError"),
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("APICallError"),
    isRetryable: Schema.Boolean,
    message: Schema.String,
    requestBodyValues: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("AbortError"),
    message: Schema.String,
  }),
);

const Git = Schema.Struct({
  /**
   * The remote URL of the repository
   */
  origin: Schema.optional(Schema.String),
  worktree: Schema.optional(
    Schema.Struct({
      /**
       * The gitdir path stored in worktree .git file.
       */
      gitdir: Schema.String,
    }),
  ),
  /**
   * The current branch name of the worktree
   */
  branch: Schema.String,
});

export const tables = {
  tasks: State.SQLite.table({
    name: "tasks",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      shareId: State.SQLite.text({ nullable: true }),
      cwd: State.SQLite.text({ nullable: true }),
      isPublicShared: State.SQLite.boolean({ default: false }),
      title: State.SQLite.text({ nullable: true }),
      parentId: State.SQLite.text({ nullable: true }),
      status: State.SQLite.text({
        default: "pending-input",
        schema: TaskStatus,
      }),
      todos: State.SQLite.json({
        default: [],
        schema: Todos,
      }),
      git: State.SQLite.json({
        nullable: true,
        schema: Git,
      }),
      totalTokens: State.SQLite.integer({ nullable: true }),
      error: State.SQLite.json({ schema: TaskError, nullable: true }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
    indexes: [
      {
        name: "idx-parentId",
        columns: ["parentId"],
      },
      {
        name: "idx-shareId",
        columns: ["shareId"],
        isUnique: true,
      },
      {
        name: "idx-cwd",
        columns: ["cwd"],
      },
    ],
  }),
  // Many to one relationship with tasks
  messages: State.SQLite.table({
    name: "messages",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      taskId: State.SQLite.text(),
      data: State.SQLite.json({ schema: DBMessage }),
    },
    indexes: [
      {
        name: "idx-taskId",
        columns: ["taskId"],
      },
    ],
  }),
  blobs: State.SQLite.table({
    name: "blobs",
    columns: {
      checksum: State.SQLite.text({ primaryKey: true }),
      mimeType: State.SQLite.text(),
      data: State.SQLite.blob(),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
};

const taskInitFields = {
  id: Schema.String,
  parentId: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  createdAt: Schema.Date,
};

const taskFullFields = {
  ...taskInitFields,
  git: Schema.optional(Git),
  shareId: Schema.optional(Schema.String),
  isPublicShared: Schema.Boolean,
  title: Schema.optional(Schema.String),
  status: TaskStatus,
  todos: Todos,
  totalTokens: Schema.optional(Schema.Number),
  error: Schema.optional(TaskError),
  updatedAt: Schema.Date,
};

// Events describe data changes (https://docs.livestore.dev/reference/events)
export const events = {
  taskInited: Events.synced({
    name: "v1.TaskInited",
    schema: Schema.Struct({
      ...taskInitFields,
      initMessage: Schema.optional(
        Schema.Struct({
          id: Schema.String,
          parts: Schema.Array(DBUIPart),
        }),
      ),
    }),
  }),
  taskFailed: Events.synced({
    name: "v1.TaskFailed",
    schema: Schema.Struct({
      id: Schema.String,
      error: TaskError,
      updatedAt: Schema.Date,
    }),
  }),
  taskSynced: Events.synced({
    name: "v1.TaskSynced",
    schema: Schema.Struct({
      ...taskFullFields,
      messages: Schema.Array(DBMessage),
    }),
  }),
  chatStreamStarted: Events.synced({
    name: "v1.ChatStreamStarted",
    schema: Schema.Struct({
      id: Schema.String,
      data: DBMessage,
      todos: Todos,
      // @deprecated
      // use updateTitle instead
      title: Schema.optional(Schema.String),
      git: Schema.optional(Git),
      updatedAt: Schema.Date,
    }),
  }),
  chatStreamFinished: Events.synced({
    name: "v1.ChatStreamFinished",
    schema: Schema.Struct({
      id: Schema.String,
      data: DBMessage,
      totalTokens: Schema.NullOr(Schema.Number),
      status: TaskStatus,
      updatedAt: Schema.Date,
    }),
  }),
  chatStreamFailed: Events.synced({
    name: "v1.ChatStreamFailed",
    schema: Schema.Struct({
      id: Schema.String,
      error: TaskError,
      data: Schema.NullOr(DBMessage),
      updatedAt: Schema.Date,
    }),
  }),
  updateShareId: Events.synced({
    name: "v1.UpdateShareId",
    schema: Schema.Struct({
      id: Schema.String,
      shareId: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  updateTitle: Events.synced({
    name: "v1.UpdateTitle",
    schema: Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  updateIsPublicShared: Events.synced({
    name: "v1.UpdateIsPublicShared",
    schema: Schema.Struct({
      id: Schema.String,
      isPublicShared: Schema.Boolean,
      updatedAt: Schema.Date,
    }),
  }),
  blobInserted: Events.synced({
    name: "v1.BlobInserted",
    schema: Schema.Struct({
      checksum: Schema.String,
      createdAt: Schema.Date,
      mimeType: Schema.String,
      data: Schema.Uint8Array,
    }),
  }),
};

// Materializers are used to map events to state (https://docs.livestore.dev/reference/state/materializers)
const materializers = State.SQLite.materializers(events, {
  "v1.TaskInited": ({ id, parentId, createdAt, cwd, initMessage }) => [
    tables.tasks.insert({
      id,
      status: initMessage ? "pending-model" : "pending-input",
      parentId,
      createdAt,
      cwd,
      updatedAt: createdAt,
    }),
    ...(initMessage
      ? [
          tables.messages.insert({
            id: initMessage.id,
            taskId: id,
            data: {
              id: initMessage.id,
              role: "user",
              parts: initMessage.parts,
            },
          }),
        ]
      : []),
  ],
  "v1.TaskFailed": ({ id, error, updatedAt }) => [
    tables.tasks
      .update({
        status: "failed",
        error,
        updatedAt,
      })
      .where({ id }),
  ],
  "v1.TaskSynced": ({ messages, ...task }) => [
    tables.tasks.insert(task).onConflict("id", "replace"),
    tables.messages.delete().where("taskId", "=", task.id),
    ...messages.map((message) =>
      tables.messages
        .insert({
          id: message.id,
          taskId: task.id,
          data: message,
        })
        .onConflict("id", "replace"),
    ),
  ],
  "v1.ChatStreamStarted": ({ id, data, todos, git, title, updatedAt }) => [
    tables.tasks
      .update({
        status: "pending-model",
        todos,
        git,
        title,
        updatedAt,
      })
      .where({ id }),
    tables.messages
      .insert({
        id: data.id,
        taskId: id,
        data,
      })
      .onConflict("id", "replace"),
  ],
  "v1.ChatStreamFinished": ({ id, data, totalTokens, status, updatedAt }) => [
    tables.tasks
      .update({
        totalTokens,
        status,
        updatedAt,
        // Clear error if the stream is finished
        error: null,
      })
      .where({ id }),
    tables.messages
      .insert({
        id: data.id,
        data,
        taskId: id,
      })
      .onConflict("id", "replace"),
  ],
  "v1.ChatStreamFailed": ({ id, error, updatedAt, data }) => [
    tables.tasks
      .update({
        status: "failed",
        error,
        updatedAt,
      })
      .where({ id }),
    ...(data
      ? [
          tables.messages
            .insert({
              id: data.id,
              taskId: id,
              data,
            })
            .onConflict("id", "replace"),
        ]
      : []),
  ],
  "v1.UpdateShareId": ({ id, shareId, updatedAt }) =>
    tables.tasks.update({ shareId, updatedAt }).where({ id, shareId: null }),
  "v1.UpdateTitle": ({ id, title, updatedAt }) =>
    tables.tasks.update({ title, updatedAt }).where({ id }),
  "v1.UpdateIsPublicShared": ({ id, isPublicShared, updatedAt }) =>
    tables.tasks.update({ isPublicShared, updatedAt }).where({ id }),
  "v1.BlobInserted": ({ checksum, mimeType, data, createdAt }) =>
    tables.blobs
      .insert({
        checksum,
        mimeType,
        data: new Uint8Array(data),
        createdAt,
      })
      .onConflict("checksum", "ignore"),
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
