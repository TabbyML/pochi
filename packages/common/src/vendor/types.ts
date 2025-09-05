import z from "zod/v4";

export const ModelOptions = z.object({
  label: z.string().optional(),
  contextWindow: z.number().optional(),
  useToolCallMiddleware: z.boolean().optional(),
});

export type ModelOptions = z.infer<typeof ModelOptions>;
