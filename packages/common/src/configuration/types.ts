import z from "zod";
import {
  DefaultEffectiveContextWindow,
  MinEffectiveContextWindow,
} from "../base/constants";
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
    effectiveContextWindow: (strict
      ? z.number()
      : z
          .number()
          .transform((value) => Math.max(value, MinEffectiveContextWindow))
    )
      .optional()
      .describe(
        `Token count at which auto-compaction triggers, even when the model declares a larger context window (models tend to degrade earlier on agentic tasks). Models whose real context window is smaller trigger earlier to leave room for the summary. Minimum ${MinEffectiveContextWindow}, defaults to ${DefaultEffectiveContextWindow}.`,
      ),
  });
}
