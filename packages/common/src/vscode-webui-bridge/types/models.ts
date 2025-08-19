import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import z from "zod";

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
        .describe("Maximum number of generated tokens for the model"),
      contextWindow: z.number().describe("Context window size for the model"),
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

export const CustomModelSetting = z.discriminatedUnion("kind", [
  OpenAIModelSettings,
  GoogleVertexTuningModelSettings,
]);

/**
 * Custom model setting
 */
export type CustomModelSetting = z.infer<typeof CustomModelSetting>;

export interface VSCodeModel {
  vendor?: string;
  family?: string;
  version?: string;
  id?: string;
  contextWindow: number;
}

export interface VSCodeLmRequestOptions {
  model: Omit<VSCodeModel, "contextWindow">;
  messages: LanguageModelV2Prompt;
  abortSignal?: AbortSignal;
}

export type VSCodeLmRequest = (
  options: VSCodeLmRequestOptions,
  onChunk: (chunk: string) => Promise<void>,
) => Promise<void>;
