import { tables } from "@getpochi/livekit/catalog";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./types";

export const app = new Hono<{ Bindings: Env }>();

app.get(
  "/",
  zValidator(
    "query",
    z.object({
      storeId: z.string(),
    }),
  ),
  async (c) => {
    const clientDo = c.env.CLIENT_DO;
    clientDo.storeId = c.req.valid("query").storeId;
    const store = await clientDo.getStore();

    // Kick off subscription to store
    await clientDo.subscribeToStore();

    const tasks = store.query(tables.tasks);
    return c.json(tasks);
  },
);
