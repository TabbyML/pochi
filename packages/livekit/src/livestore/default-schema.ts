import {
  Events,
  Schema,
  State,
  deprecated,
  makeSchema,
} from "@livestore/livestore";
import {
  DBMessage,
  DBUIPart,
  Git,
  LineChanges,
  TaskError,
  TaskStatus,
  Todos,
  ToolCalls,
  taskInitFields,
} from "./types";

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
      runAsync: State.SQLite.boolean({ nullable: true }),
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
      pendingToolCalls: State.SQLite.json({
        nullable: true,
        schema: ToolCalls,
      }),
      lineChanges: State.SQLite.json({
        nullable: true,
        schema: LineChanges,
      }),
      totalTokens: State.SQLite.integer({ nullable: true }),
      lastStepDuration: State.SQLite.integer({
        nullable: true,
        schema: Schema.DurationFromMillis,
      }),
      lastCheckpointHash: State.SQLite.text({
        nullable: true,
      }),
      error: State.SQLite.json({ schema: TaskError, nullable: true }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      modelId: State.SQLite.text({ nullable: true }),
      displayId: State.SQLite.integer({ nullable: true }),
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
  files: State.SQLite.table({
    name: "files",
    columns: {
      filePath: State.SQLite.text(),
      content: State.SQLite.text(),
    },
    primaryKey: ["filePath"],
    indexes: [
      {
        name: "idx-filePath",
        columns: ["filePath"],
        isUnique: true,
      },
    ],
  }),
};

const taskInitedSchema = Schema.Struct({
  ...taskInitFields,
  initMessages: Schema.optional(Schema.Array(DBMessage)),
  initTitle: Schema.optional(Schema.String),
  displayId: Schema.optional(Schema.Number).pipe(
    deprecated("Concept of displayId is removed"),
  ),
  // @deprecated
  // use initMessages instead
  initMessage: Schema.optional(
    Schema.Struct({
      id: Schema.String,
      parts: Schema.Array(DBUIPart),
    }),
  ).pipe(deprecated("use initMessages instead")),
});

const taskFailedSchema = Schema.Struct({
  id: Schema.String,
  error: TaskError,
  updatedAt: Schema.Date,
});

const chatStreamStartedSchema = Schema.Struct({
  id: Schema.String,
  data: DBMessage,
  todos: Todos,
  title: Schema.optional(Schema.String).pipe(
    deprecated("use updateTitle instead"),
  ),
  git: Schema.optional(Git),
  updatedAt: Schema.Date,
  modelId: Schema.optional(Schema.String),
  displayId: Schema.optional(Schema.Number).pipe(
    deprecated("Concept of displayId is removed"),
  ),
});

const chatStreamFinishedSchema = Schema.Struct({
  id: Schema.String,
  data: DBMessage,
  totalTokens: Schema.NullOr(Schema.Number),
  status: TaskStatus,
  updatedAt: Schema.Date,
  duration: Schema.optional(Schema.DurationFromMillis),
  lastCheckpointHash: Schema.optional(Schema.String),
});

const chatStreamFailedSchema = Schema.Struct({
  id: Schema.String,
  error: TaskError,
  data: Schema.NullOr(DBMessage),
  updatedAt: Schema.Date,
  duration: Schema.optional(Schema.DurationFromMillis),
  lastCheckpointHash: Schema.optional(Schema.String),
});

export const events = {
  taskInited: Events.synced({
    name: "v1.TaskInited",
    schema: taskInitedSchema,
  }),
  asyncTaskInited: Events.clientOnly({
    name: "client.AsyncTaskInited",
    schema: taskInitedSchema,
  }),
  taskFailed: Events.synced({
    name: "v1.TaskFailed",
    schema: taskFailedSchema,
  }),
  asyncTaskFailed: Events.clientOnly({
    name: "client.AsyncTaskFailed",
    schema: taskFailedSchema,
  }),
  chatStreamStarted: Events.synced({
    name: "v1.ChatStreamStarted",
    schema: chatStreamStartedSchema,
  }),
  asyncChatStreamStarted: Events.clientOnly({
    name: "client.AsyncChatStreamStarted",
    schema: chatStreamStartedSchema,
  }),
  chatStreamFinished: Events.synced({
    name: "v1.ChatStreamFinished",
    schema: chatStreamFinishedSchema,
  }),
  asyncChatStreamFinished: Events.clientOnly({
    name: "client.AsyncChatStreamFinished",
    schema: chatStreamFinishedSchema,
  }),
  chatStreamFailed: Events.synced({
    name: "v1.ChatStreamFailed",
    schema: chatStreamFailedSchema,
  }),
  asyncChatStreamFailed: Events.clientOnly({
    name: "client.AsyncChatStreamFailed",
    schema: chatStreamFailedSchema,
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
  _blobInserted: Events.synced({
    name: "v1.BlobInserted",
    schema: Schema.Struct({
      checksum: Schema.String,
      createdAt: Schema.Date,
      mimeType: Schema.String,
      data: Schema.Uint8Array,
    }).pipe(deprecated("blob is deprecated")),
  }),
  updateLineChanges: Events.synced({
    name: "v1.updateLineChanges",
    schema: Schema.Struct({
      id: Schema.String,
      lineChanges: LineChanges,
      updatedAt: Schema.Date,
    }),
  }),
  // @deprecated use writeStoreFile instead
  _writeTaskFile: Events.synced({
    name: "v1.WriteTaskFile",
    schema: Schema.Struct({
      taskId: Schema.String,
      filePath: Schema.Union(
        Schema.Literal("/plan.md", "/walkthrough.md", "/memory.md"),
        Schema.TemplateLiteral("/browser-session/", Schema.String, ".mp4"),
      ),
      content: Schema.String,
    }),
    deprecated: "Use writeStoreFile instead",
  }),
  writeStoreFile: Events.synced({
    name: "v1.WriteStoreFile",
    schema: Schema.Struct({
      filePath: Schema.Union(
        Schema.Literal("/plan.md", "/walkthrough.md", "/memory.md"),
        Schema.TemplateLiteral("/browser-session/", Schema.String, ".mp4"),
      ),
      content: Schema.String,
    }),
  }),
  updateMessages: Events.synced({
    name: "v1.UpdateMessages",
    schema: Schema.Struct({
      messages: Schema.Array(DBMessage),
    }),
  }),
  forkTaskInited: Events.synced({
    name: "v1.ForkTaskInited",
    schema: Schema.Struct({
      tasks: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          cwd: Schema.optional(Schema.String),
          title: Schema.optional(Schema.String),
          parentId: Schema.optional(Schema.String),
          modelId: Schema.optional(Schema.String),
          status: TaskStatus,
          git: Schema.optional(Git),
          createdAt: Schema.Date,
        }),
      ),
      messages: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          taskId: Schema.String,
          data: DBMessage,
        }),
      ),
      files: Schema.Array(
        Schema.Struct({
          filePath: Schema.String,
          content: Schema.String,
        }),
      ),
    }),
  }),
};

const materializeTaskInited = ({
  id,
  parentId,
  runAsync,
  createdAt,
  cwd,
  initMessage,
  initMessages,
  initTitle,
  displayId,
}: typeof taskInitedSchema.Type) => [
  tables.tasks.insert({
    id,
    shareId: parentId ? undefined : `p-${id.replaceAll("-", "")}`,
    status: initMessages
      ? initMessages.length > 0
        ? "pending-model"
        : "pending-input"
      : initMessage
        ? "pending-model"
        : "pending-input",
    parentId,
    runAsync: runAsync ?? false,
    createdAt,
    cwd,
    title: initTitle,
    displayId,
    updatedAt: createdAt,
    isPublicShared: true,
  }),
  ...(initMessages?.map((message) => {
    return tables.messages.insert({
      id: message.id,
      taskId: id,
      data: message,
    });
  }) ??
    (initMessage
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
      : [])),
];

const materializeTaskFailed = ({
  id,
  error,
  updatedAt,
}: typeof taskFailedSchema.Type) => [
  tables.tasks
    .update({
      status: "failed",
      error,
      updatedAt,
    })
    .where({ id }),
];

const materializeChatStreamStarted = ({
  id,
  data,
  todos,
  git,
  title,
  updatedAt,
  modelId,
  displayId,
}: typeof chatStreamStartedSchema.Type) => [
  tables.tasks
    .update({
      status: "pending-model",
      todos,
      git,
      title,
      updatedAt,
      modelId,
      displayId,
      lastCheckpointHash: null, // set as null to disable user edit when streaming
    })
    .where({ id }),
  tables.messages
    .insert({
      id: data.id,
      taskId: id,
      data,
    })
    .onConflict("id", "replace"),
];

const materializeChatStreamFinished = ({
  id,
  data,
  totalTokens,
  status,
  updatedAt,
  duration,
  lastCheckpointHash,
}: typeof chatStreamFinishedSchema.Type) => [
  tables.tasks
    .update({
      totalTokens,
      status,
      updatedAt,
      // Clear error if the stream is finished
      error: null,
      lastStepDuration: duration ?? undefined,
      lastCheckpointHash: lastCheckpointHash,
    })
    .where({ id }),
  tables.messages
    .insert({
      id: data.id,
      data,
      taskId: id,
    })
    .onConflict("id", "replace"),
];

const materializeChatStreamFailed = ({
  id,
  error,
  updatedAt,
  data,
  duration,
  lastCheckpointHash,
}: typeof chatStreamFailedSchema.Type) => [
  tables.tasks
    .update({
      status: "failed",
      error,
      updatedAt,
      lastStepDuration: duration ?? undefined,
      lastCheckpointHash,
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
];

const materializers = State.SQLite.materializers(events, {
  "v1.TaskInited": materializeTaskInited,
  "client.AsyncTaskInited": materializeTaskInited,
  "v1.TaskFailed": materializeTaskFailed,
  "client.AsyncTaskFailed": materializeTaskFailed,
  "v1.ChatStreamStarted": materializeChatStreamStarted,
  "client.AsyncChatStreamStarted": materializeChatStreamStarted,
  "v1.ChatStreamFinished": materializeChatStreamFinished,
  "client.AsyncChatStreamFinished": materializeChatStreamFinished,
  "v1.ChatStreamFailed": materializeChatStreamFailed,
  "client.AsyncChatStreamFailed": materializeChatStreamFailed,
  "v1.UpdateShareId": ({ id, shareId, updatedAt }) =>
    tables.tasks.update({ shareId, updatedAt }).where({ id, shareId: null }),
  "v1.UpdateTitle": ({ id, title, updatedAt }) =>
    tables.tasks.update({ title, updatedAt }).where({ id }),
  "v1.UpdateIsPublicShared": ({ id, isPublicShared, updatedAt }) =>
    tables.tasks.update({ isPublicShared, updatedAt }).where({ id }),
  // @deprecated materializer kept for backward compatibility
  "v1.WriteTaskFile": ({ filePath, content }) =>
    tables.files
      .insert({
        filePath,
        content,
      })
      .onConflict("filePath", "replace"),
  "v1.WriteStoreFile": ({ filePath, content }) =>
    tables.files
      .insert({
        filePath,
        content,
      })
      .onConflict("filePath", "replace"),
  "v1.BlobInserted": () => [],
  "v1.updateLineChanges": ({ id, lineChanges, updatedAt }) =>
    tables.tasks
      .update({
        lineChanges,
        updatedAt,
      })
      .where({ id }),
  "v1.UpdateMessages": ({ messages }) =>
    messages.map((message) =>
      tables.messages
        .update({
          data: message,
        })
        .where({ id: message.id }),
    ),
  "v1.ForkTaskInited": ({ tasks, messages, files }) => [
    ...tasks.map((task) =>
      tables.tasks.insert({
        ...task,
        shareId: task.parentId ? undefined : `p-${task.id.replaceAll("-", "")}`,
        updatedAt: task.createdAt,
      }),
    ),
    ...messages.map((message) => tables.messages.insert(message)),
    ...files.map((file) => tables.files.insert(file)),
  ],
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
