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
  storeId: z.string().optional(),
  clientTaskData: z.unknown().optional(),
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

export const UploadFileRequest = z.object({
  file: z.instanceof(File),
});

export type UploadFileRequest = z.infer<typeof UploadFileRequest>;

export const UploadFileResponse = z.object({
  url: z.string(),
});
export type UploadFileResponse = z.infer<typeof UploadFileResponse>;

// Code Completion FIM API
export const CodeCompletionFIMRequest = z.object({
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

export const CodeCompletionFIMResponse = z.object({
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

export type CodeCompletionFIMRequest = z.infer<typeof CodeCompletionFIMRequest>;
export type CodeCompletionFIMResponse = z.infer<
  typeof CodeCompletionFIMResponse
>;

const stub = new Hono()
  .post("/api/chat/stream", zValidator("json", ModelGatewayRequest))
  .post("/api/chat/persist", zValidator("json", PersistRequest), async (c) =>
    c.json({} as PersistResponse),
  )
  .post(
    "/api/code/fim/completion",
    zValidator("json", CodeCompletionFIMRequest),
    async (c) => c.json({} as CodeCompletionFIMResponse),
  )
  .post("/api/upload", zValidator("form", UploadFileRequest), async (c) =>
    c.json({} as UploadFileResponse),
  )
  .get("/api/models", async (c) => c.json([] as ListModelsResponse));

export type PochiApi = typeof stub;
export type PochiApiClient = ReturnType<typeof hc<PochiApi>>;

export const PochiApiErrors = {
  RequireSubscription: "REQUIRE_SUBSCRIPTION",
  RequireOrgSubscription: "REQUIRE_ORG_SUBSCRIPTION",
  ReachedCreditLimit: "REACHED_CREDIT_LIMIT",
  ReachedOrgCreditLimit: "REACHED_ORG_CREDIT_LIMIT",
  RequirePayment: "REQUIRE_PAYMENT",
  RequireOrgPayment: "REQUIRE_ORG_PAYMENT",
  RequireGithubIntegration: "REQUIRE_GITHUB_INTEGRATION",
};
