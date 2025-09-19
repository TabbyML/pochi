import z from "zod/v4";
import { McpServerConfig } from "./mcp";
import { CustomModelSetting } from "./model";
import { VendorConfig } from "./vendor";

function getObjectSchemaDefaults<Schema extends z.ZodObject>(schema: Schema) {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => {
      return [key, value.unwrap().def.defaultValue];
    }),
  );
}

export const PochiConfig = makePochiConfig();

export const getPochiConfigDefaults = () =>
  getObjectSchemaDefaults(PochiConfig);

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
    vendors: z
      .record(z.string(), VendorConfig.nullable())
      .default({})
      .optional(),
    providers: looseRecord(CustomModelSetting, strict)
      .default({
        openai: {
          kind: "openai",
          baseURL: "https://api.openai.com/v1",
          apiKey: "your api key here",
          models: {
            "gpt-4.1": {
              name: "GPT-4.1",
            },
            "o4-mini": {
              name: "O4-Mini",
            },
          },
        },
      })
      .optional(),
    mcp: looseRecord(McpServerConfig, strict).default({}).optional(),
  });
}
