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
  providers: z.array(CustomModelSetting).optional(),
  mcp: z.record(z.string(), McpServerConfig).optional(),
});

export type PochiConfig = z.infer<typeof PochiConfig>;
