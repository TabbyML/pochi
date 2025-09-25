import { verifyJWT } from "@/lib/jwt";
import type { ShareEvent } from "@getpochi/common/share-utils";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { type Message, catalog } from "@getpochi/livekit";
import type { ClientTools, SubTask } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import type { UIMessage } from "ai";
import type { InferToolInput } from "ai";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { DeepWritable, Env } from "./types";

const REDACTED_MESSAGE = "[FILE CONTENT REDACTED]";

// Sanitize sensitive content from tool calls
function sanitizeMessage(message: Message): Message {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === "tool-readFile" && part.output?.content) {
        return {
          ...part,
          output: {
            ...part.output,
            content: REDACTED_MESSAGE,
          },
        };
      }

      if (
        part.type === "tool-applyDiff" &&
        (part.input?.searchContent || part.input?.replaceContent)
      ) {
        return {
          ...part,
          input: {
            ...part.input,
            searchContent: REDACTED_MESSAGE,
            replaceContent: REDACTED_MESSAGE,
          },
        };
      }

      if (
        part.type === "tool-multiApplyDiff" &&
        part.input?.edits &&
        part.input.edits.length > 0
      ) {
        return {
          ...part,
          input: {
            ...part.input,
            edits: part.input.edits.map((edit: unknown) => ({
              ...(edit as Record<string, unknown>),
              searchContent: REDACTED_MESSAGE,
              replaceContent: REDACTED_MESSAGE,
            })),
          },
        };
      }

      return part;
    }) as Message["parts"],
  };
}

type RequestVariables = {
  isOwner: boolean;
};

const checkOwner: MiddlewareHandler<{
  Bindings: Env;
  Variables: RequestVariables;
}> = async (c, next) => {
  const store = await c.env.getStore();
  const jwt = c.req.header("authorization")?.replace("Bearer ", "");
  const user = jwt && (await verifyJWT(undefined, jwt));
  const isOwner = user && user.sub === decodeStoreId(store.storeId).sub;
  c.set("isOwner", !!isOwner);
  await next();
};

const store = new Hono<{ Bindings: Env; Variables: RequestVariables }>().use(
  checkOwner,
);

store
  .post("/tasks/share", async (c) => {
    if (!c.get("isOwner")) {
      throw new HTTPException(403, { message: "Unauthorized" });
    }
    const tasks = await c.env.reloadShareTasks();
    return c.json(tasks);
  })
  .get("/tasks/:taskId/json", async (c) => {
    const store = await c.env.getStore();
    const taskId = c.req.param("taskId");

    const task = store.query(catalog.queries.makeTaskQuery(taskId));

    if (!task) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    if (!task.isPublicShared) {
      if (!c.get("isOwner")) {
        throw new HTTPException(403, { message: "Task is not public" });
      }
    }

    const messages = store
      .query(catalog.queries.makeMessagesQuery(taskId))
      .map((x) => sanitizeMessage(x.data as Message))
      .map((x) => x as UIMessage);

    const subTasks = collectSubTasks(store, taskId).map((subTask) => ({
      ...subTask,
      messages: subTask.messages.map((x) => sanitizeMessage(x as Message)),
    }));

    const user = await c.env.getOwner();

    return c.json({
      type: "share",
      messages: inlineSubTasks(messages, subTasks),
      todos: task.todos as DeepWritable<typeof task.todos>,
      isLoading: task.status === "pending-model",
      error: task.error,
      // FIXME: Use the actual user name
      user: {
        name: user?.name || "You",
        image:
          user?.image ||
          `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(task.title || "")}&scale=150`,
      },
      assistant: {
        name: "Pochi",
        image: "https://app.getpochi.com/logo192.png",
      },
    } satisfies ShareEvent);
  })
  .get("/tasks/:taskId/html", async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
  });

export const app = new Hono<{ Bindings: Env }>();
app
  .use("/stores/:storeId/*", async (c, next) => {
    const storeId = c.req.param("storeId");
    await c.env.setStoreId(storeId);
    await next();
  })
  .route("/stores/:storeId", store);

function collectSubTasks(store: Store<typeof catalog.schema>, taskId: string) {
  const tasks = store.query(catalog.queries.makeSubTaskQuery(taskId));
  return tasks.map((task) => {
    const messages = store.query(catalog.queries.makeMessagesQuery(task.id));
    return {
      clientTaskId: task.id,
      todos: task.todos as DeepWritable<typeof task.todos>,
      messages: messages.map((message) => message.data) as UIMessage[],
    } satisfies SubTask;
  });
}

function inlineSubTasks(
  uiMessages: UIMessage[],
  subtasks: SubTask[],
): UIMessage[] {
  return uiMessages.map((uiMessage) => {
    const partsWithSubtasks = uiMessage.parts.map((part) => {
      if (part.type === "tool-newTask" && part.state !== "input-streaming") {
        const input = part.input as InferToolInput<ClientTools["newTask"]>;
        const subtask = subtasks.find(
          (t) => t.clientTaskId === input._meta?.uid,
        );
        if (subtask) {
          return {
            ...part,
            input: {
              ...input,
              _transient: {
                task: subtask,
              },
            },
          };
        }
      }
      return part;
    });
    return {
      ...uiMessage,
      parts: partsWithSubtasks,
    };
  });
}
