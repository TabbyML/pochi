import z from "zod/v4";

const BaseModelSettings = z.object({
  name: z
    .string()
    .optional()
    .describe(
      'Display name of the provider, e.g., "OpenAI", "Anthropic", etc.',
    ),
  models: z.record(
    z.string(),
    z.object({
      name: z
        .string()
        .optional()
        .describe('Display name of the model, e.g., "GPT-4o"'),
      maxTokens: z
        .number()
        .optional()
        .describe("Maximum number of generated tokens for the model"),
      contextWindow: z
        .number()
        .optional()
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

const OpenAIResponsesModelSettings = BaseModelSettings.extend({
  kind: z.literal("openai-responses"),
  baseURL: z
    .string()
    .optional()
    .describe(
      'Base URL for the model provider\'s API, e.g., "https://api.openai.com/v1"',
    ),
  apiKey: z
    .string()
    .optional()
    .describe("API key for the model provider, if required."),
});

const AnthropicModelSettings = BaseModelSettings.extend({
  kind: z.literal("anthropic"),
  baseURL: z
    .string()
    .optional()
    .describe(
      'Base URL for the model provider\'s API, e.g., "https://api.anthropic.com/v1"',
    ),
  apiKey: z
    .string()
    .optional()
    .describe("API key for the model provider, if required."),
});

export const GoogleVertexModel = z.union([
  z.object({
    serviceAccountKey: z.string(),
    location: z.string(),
  }),
  z.object({
    accessToken: z.string(),
    projectId: z.string(),
    location: z.string(),
  }),
]);

export type GoogleVertexModel = z.infer<typeof GoogleVertexModel>;

const GoogleVertexTuningModelSettings = BaseModelSettings.extend({
  kind: z.literal("google-vertex-tuning"),
  vertex: GoogleVertexModel,
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
  OpenAIResponsesModelSettings,
  AnthropicModelSettings,
  GoogleVertexTuningModelSettings,
  AiGatewayModelSettings,
]);

/**
 * Custom model setting
 */
export type CustomModelSetting = z.infer<typeof CustomModelSetting>;
