import { Todo } from "@getpochi/tools";
import type { UIMessage } from "ai";
import z from "zod";

export const ShareEvent = z.object({
  type: z.literal("share"),
  messages: z.array(z.custom<UIMessage>()).optional(),
  user: z
    .object({
      name: z.string(),
      image: z.string().optional().nullable(),
    })
    .optional(),
  assistant: z
    .object({
      name: z.string(),
      image: z.string().optional().nullable(),
    })
    .optional(),
  todos: z.array(Todo).optional(),
  isLoading: z.boolean().optional(),
  error: z
    .object({
      message: z.string(),
    })
    .optional()
    .nullable(),
});

export type ShareEvent = z.infer<typeof ShareEvent>;

export const ResizeEvent = z.object({
  type: z.literal("resize"),
  height: z.number(),
});

export type ResizeEvent = z.infer<typeof ResizeEvent>;
