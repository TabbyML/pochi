import z from "zod/v4";
import { McpServerConfig } from "./mcp";
import { CustomModelSetting } from "./model";

export const PochiConfig = z.object({
  $schema: z
    .string()
    .default("https://getpochi.com/config.schema.json")
    .optional(),
  credentials: z
    .object({
      pochiToken: z.string().optional(),
    })
    .optional(),
  providers: z
    .record(z.string(), CustomModelSetting.optional().catch(undefined))
    .transform(removeUndefined)
    .optional(),
  mcp: z
    .record(z.string(), McpServerConfig.optional().catch(undefined))
    .transform(removeUndefined)
    .optional(),
});

export type PochiConfig = z.infer<typeof PochiConfig>;

function removeUndefined<T>(
  obj: Record<string, T | undefined>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      (entry): entry is [string, T] => entry[1] !== undefined,
    ),
  );
}
