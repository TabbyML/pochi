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
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
  ),
});

const ExtendedModelSettings = BaseModelSettings.extend({
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

const OpenAIModelSettings = ExtendedModelSettings.extend({
  kind: z.optional(z.literal("openai")),
});

const OpenAIResponsesModelSettings = ExtendedModelSettings.extend({
  kind: z.literal("openai-responses"),
});

const AnthropicModelSettings = ExtendedModelSettings.extend({
  kind: z.literal("anthropic"),
});

export const GoogleVertexModel = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("service-account"),
      serviceAccountKey: z.string(),
      location: z.string(),
    }),
    z.object({
      type: z.literal("access-token"),
      accessToken: z.string(),
      projectId: z.string(),
      location: z.string(),
    }),
    z.object({
      type: z.literal("model-url"),
      issueUrl: z.string(),
      modelUrl: z.string(),
      timeout: z
        .number()
        .describe("Timeout in milliseconds when requesting model api"),
    }),
  ])
  .prefault(() => ({
    type:
      (process.env.POCHI_VERTEX_TYPE as
        | "service-account"
        | "model-url"
        | "access-token"
        | undefined) ?? "model-url",
    serviceAccountKey: process.env.POCHI_VERTEX_SERVICE_ACCOUNT_KEY ?? "",
    accessToken: process.env.POCHI_VERTEX_ACCESS_TOKEN ?? "",
    projectId: process.env.POCHI_VERTEX_PROJECT_ID ?? "",
    location: process.env.POCHI_VERTEX_LOCATION ?? "",
    issueUrl: process.env.POCHI_VERTEX_ISSUE_URL ?? "",
    modelUrl: process.env.POCHI_VERTEX_MODEL_URL ?? "",
    // By default timeout is 15min
    timeout: Number.parseInt(
      process.env.POCHI_VERTEX_MODEL_TIMEOUT ?? "900000",
    ),
  }));

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
