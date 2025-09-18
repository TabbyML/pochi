import type { ShareEvent } from "@getpochi/common/share-utils";
import { catalog } from "@getpochi/livekit";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { DeepWriteable, Env } from "./types";

const store = new Hono<{ Bindings: Env }>();

store
  .get("/:storeId/tasks/:taskId/json", async (c) => {
    const storeId = c.req.param("storeId");
    c.env.setStoreId(storeId);
    const store = await c.env.getStore();
    const taskId = c.req.param("taskId");

    const task = store.query(catalog.queries.makeTaskQuery(taskId));
    const messages = store.query(catalog.queries.makeMessagesQuery(taskId));

    if (!task) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    const user = await c.env.getUser();

    return c.json({
      type: "share",
      messages: messages.map((message) => message.data) as UIMessage[],
      todos: task.todos as DeepWriteable<typeof task.todos>,
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
  .get("/:storeId/tasks/:taskId/html", async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
  });

export const app = new Hono<{ Bindings: Env }>();
app.route("/stores", store);
