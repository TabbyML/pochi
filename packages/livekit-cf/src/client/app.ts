import { catalog } from "@getpochi/livekit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";

const store = new Hono<{ Bindings: Env }>();

store
  .get("/", async (c) => {
    // Activate store
    await c.env.getStore();
    return c.json({ success: true });
  })
  .get("/tasks", async (c) => {
    const store = await c.env.getStore();
    const tasks = store.query(catalog.queries.tasks$);
    return c.json({ tasks });
  })
  .get("/tasks/:taskId", async (c) => {
    const store = await c.env.getStore();
    const taskId = c.req.param("taskId");

    const task = store.query(catalog.queries.makeTaskQuery(taskId));
    const messages = store.query(catalog.queries.makeMessagesQuery(taskId));

    if (!task) {
      throw new HTTPException(404, { message: "Task not found" });
    }

    return c.json({
      type: "share",
      messages: messages.map((message) => message.data),
      todos: task.todos,
      isLoading: task.status === "pending-model",
      error: task.error,
      // FIXME: Use the actual user name
      user: {
        name: "You",
        image: `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(task.title || "")}&scale=150`,
      },
      assistant: {
        name: "Pochi",
        image: "https://app.getpochi.com/logo192.png",
      },
    });
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
