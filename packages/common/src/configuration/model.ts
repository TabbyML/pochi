import z from "zod/v4";

const BaseModelSettings = z.object({
  id: z
    .string()
    .describe('Model provider identifier, e.g., "openai", "anthropic", etc.'),
  name: z
    .string()
    .optional()
    .describe('Model provider name, e.g., "OpenAI", "Anthropic", etc.'),
  models: z.array(
    z.object({
      name: z
        .string()
        .optional()
        .describe('Display name of the model, e.g., "GPT-4o"'),
      id: z.string().describe('Identifier for the model, e.g., "gpt-4o"'),
      maxTokens: z
        .number()
        .optional()
        .default(4096)
        .describe("Maximum number of generated tokens for the model"),
      contextWindow: z
        .number()
        .optional()
        .default(100000)
        .describe("Context window size for the model"),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
    }),
  ),
});

const OpenAIModelSettings = BaseModelSettings.extend({
  kind: z.optional(z.literal("openai")),
  baseURL: z
    .string()
    .describe(
      'Base URL for the model provider\'s API, e.g., "https://api.openai.com/v1"',
    ),
  apiKey: z
    .string()
    .optional()
    .describe("API key for the model provider, if required."),
});

const GoogleVertexTuningModelSettings = BaseModelSettings.extend({
  kind: z.literal("google-vertex-tuning"),
  location: z.string().describe("Location of the model, e.g., us-central1"),
  credentials: z.string().describe("Credentials for the vertex model."),
});

const AiGatewayModelSettings = BaseModelSettings.extend({
  kind: z.literal("ai-gateway"),
  apiKey: z
    .string()
    .optional()
    .describe("API key for the model provider, if required."),
});

export const CustomModelSetting = z.discriminatedUnion("kind", [
  OpenAIModelSettings,
  GoogleVertexTuningModelSettings,
  AiGatewayModelSettings,
]);

/**
 * Custom model setting
 */
export type CustomModelSetting = z.infer<typeof CustomModelSetting>;
