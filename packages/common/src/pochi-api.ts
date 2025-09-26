import type {
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { hc } from "hono/client";
import z from "zod";

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

const stub = new Hono()
  .post("/api/chat/stream", zValidator("json", ModelGatewayRequest))
  .post("/api/chat/persist", zValidator("json", PersistRequest), async (c) =>
    c.json({} as PersistResponse),
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
