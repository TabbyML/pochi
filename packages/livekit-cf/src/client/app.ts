import type { User } from "@/types";
import type { ShareEvent } from "@getpochi/common/share-utils";
import { catalog } from "@getpochi/livekit";
import { zValidator } from "@hono/zod-validator";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import z from "zod";
import type { DeepWriteable, Env } from "./types";

const store = new Hono<{ Bindings: Env }>();

store
  .get("/", zValidator("query", z.object({ jwt: z.string() })), async (c) => {
    const user = jose.decodeJwt<User>(c.req.valid("query").jwt);

    // Activate store
    await c.env.getStore();
    await c.env.setUser(user);

    return c.json({ success: true });
  })
  .get("/tasks/:taskId/json", async (c) => {
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
  .get("/tasks/:taskId/html", async (c) => {
    return c.env.ASSETS.fetch(c.req.raw);
  });

export const app = new Hono<{ Bindings: Env }>();
app
  .use("/stores/:storeId/*", async (c, next) => {
    const storeId = c.req.param("storeId");
    c.env.setStoreId(storeId);

    // Initialize the store in middleware
    await c.env.getStore();
    return next();
  })
  .route("/stores/:storeId", store);
