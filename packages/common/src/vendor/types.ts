import z from "zod/v4";

export const ModelOptions = z.object({
  contextWindow: z.number(),
  useToolCallMiddleware: z.boolean().optional(),
});

export type ModelOptions = z.infer<typeof ModelOptions>;
