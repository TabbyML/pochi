import { catalog } from "@getpochi/livekit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "./types";

const tasks = new Hono<{ Bindings: Env }>();

tasks.get("/:taskId", async (c) => {
  const store = await c.env.getStore();
  const taskId = c.req.param("taskId");

  const task = store.query(catalog.queries.makeTaskQuery(taskId));
  const messages = store.query(catalog.queries.makeMessagesQuery(taskId));

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return c.json({
    task,
    messages,
  });
});

export const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => {
  const storeId = c.req.query("storeId");
  if (!storeId) {
    throw new HTTPException(400, { message: "storeId is required" });
  }
  c.env.setStoreId(storeId);

  // Initialize the store in middleware
  await c.env.getStore();
  return next();
});

app.route("/client-do/tasks", tasks);
