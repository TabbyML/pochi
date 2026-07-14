import z from "zod";
import { BrowserAgentSettingsConfig } from "../vscode-webui-bridge/types/browser-agent-settings";
import { McpServerConfig } from "./mcp";
import { CustomModelSetting } from "./model";
import { VendorConfig } from "./vendor";

export const PochiConfig = makePochiConfig();

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

function looseRecord<T>(
  schema: z.ZodType<T>,
  strict: boolean,
): z.ZodType<Record<string, T>> {
  if (strict) {
    // transform is not supported in toJSONSchema, thus we need strict to control the behavior between runtime / json schema gen.
    return z.record(z.string(), schema);
  }

  return z
    .record(z.string(), schema.optional().catch(undefined))
    .transform(removeUndefined);
}

export function makePochiConfig(strict = false) {
  return z.object({
    $schema: z
      .string()
      .default("https://getpochi.com/config.schema.json")
      .optional(),
    vendors: looseRecord(VendorConfig.nullable(), strict).optional(),
    providers: looseRecord(CustomModelSetting, strict).optional(),
    mcp: looseRecord(McpServerConfig, strict).optional(),
    browserAgentSettings: BrowserAgentSettingsConfig.optional(),
    effectiveContextWindow: z
      .number()
      .optional()
      .describe(
        "Effective context window (in tokens) used to cap auto-compaction. Auto-compaction triggers before this many tokens even when the model declares a larger context window, since models tend to degrade earlier. Defaults to 200000.",
      ),
  });
}
