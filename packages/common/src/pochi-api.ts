import type {
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import { zValidator } from "@hono/zod-validator";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import type { hc } from "hono/client";
import z from "zod";
import { Environment } from "./base";

export const ModelGatewayRequest = z.object({
  id: z.string().optional(),
  model: z.string().optional().describe("Model to use for this request."),
  modelEndpointId: z.string().optional(),
  callOptions: z.object({
    prompt: z.custom<LanguageModelV2Prompt>(),
    stopSequences: z.array(z.string()).optional(),
    tools: z.custom<LanguageModelV2CallOptions["tools"]>(),
  }),
});
export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequest>;

export const PersistRequest = z.object({
  id: z.string(),
  status: z
    .union([
      z.literal("completed"),
      z.literal("pending-input"),
      z.literal("failed"),
      z.literal("pending-tool"),
      z.literal("pending-model"),
    ])
    .optional(),
  messages: z.array(z.custom<UIMessage>()),
  environment: Environment.optional(),
  parentClientTaskId: z.string().optional(),
});
export type PersistRequest = z.infer<typeof PersistRequest>;

export const PersistResponse = z.object({
  shareId: z.string(),
});
export type PersistResponse = z.infer<typeof PersistResponse>;

export const ListModelsResponse = z.array(
  z.object({
    id: z.string(),
    contextWindow: z.number(),
    costType: z.union([z.literal("basic"), z.literal("premium")]),
  }),
);
export type ListModelsResponse = z.infer<typeof ListModelsResponse>;

// Code Completion API types (Fill-in-Middle style completion)
export const CodeCompletionRequest = z.object({
  prompt: z.string().describe("Code before cursor"),
  suffix: z.string().optional().describe("Code after cursor"),
  model: z.string().optional().describe("Model to use for this request."),
  temperature: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Temperature (0.0-1.0)"),
  maxTokens: z
    .number()
    .min(1)
    .optional()
    .describe("Maximum number of tokens to generate"),
  stop: z
    .array(z.string())
    .optional()
    .describe("Sequences where the model will stop generating further tokens"),
});

export const CodeCompletionResponse = z.object({
  id: z.string().describe("Completion ID"),
  choices: z
    .array(
      z.object({
        index: z.number().describe("Choice index"),
        text: z.string().describe("Generated completion text"),
      }),
    )
    .describe("Completion choices"),
});

export type CodeCompletionRequest = z.infer<typeof CodeCompletionRequest>;

export type CodeCompletionResponse = z.infer<typeof CodeCompletionResponse>;

const stub = new Hono()
  .post("/api/chat/stream", zValidator("json", ModelGatewayRequest))
  .post("/api/chat/persist", zValidator("json", PersistRequest), async (c) =>
    c.json({} as PersistResponse),
  )
  .post(
    "/api/code/completion",
    zValidator("json", CodeCompletionRequest),
    async (c) => c.json({} as CodeCompletionResponse),
  )
  .get("/api/models", async (c) => c.json([] as ListModelsResponse));

export type PochiApi = typeof stub;
export type PochiApiClient = ReturnType<typeof hc<PochiApi>> & {
  authenticated?: boolean;
};

export const PochiApiErrors = {
  RequireSubscription: "REQUIRE_SUBSCRIPTION",
  RequireOrgSubscription: "REQUIRE_ORG_SUBSCRIPTION",
  ReachedCreditLimit: "REACHED_CREDIT_LIMIT",
  ReachedOrgCreditLimit: "REACHED_ORG_CREDIT_LIMIT",
  RequirePayment: "REQUIRE_PAYMENT",
  RequireOrgPayment: "REQUIRE_ORG_PAYMENT",
  RequireGithubIntegration: "REQUIRE_GITHUB_INTEGRATION",
};
