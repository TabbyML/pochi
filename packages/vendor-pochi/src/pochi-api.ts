import type {
  LanguageModelV2CallOptions,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { hc } from "hono/client";
import z from "zod";

export const ModelGatewayRequest = z.object({
  model: z.string().optional().describe("Model to use for this request."),
  modelEndpointId: z.string().optional(),
  callOptions: z.object({
    prompt: z.custom<LanguageModelV2Prompt>(),
    stopSequences: z.array(z.string()).optional(),
    tools: z.custom<LanguageModelV2CallOptions["tools"]>(),
  }),
});
export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequest>;

export const ListModelsResponse = z.array(
  z.object({
    id: z.string(),
    contextWindow: z.number(),
    costType: z.union([z.literal("basic"), z.literal("premium")]),
  }),
);
export type ListModelsResponse = z.infer<typeof ListModelsResponse>;

/**
 * Webhook event payload for task.updated event
 * The task field uses the Task type from @getpochi/livekit package
 */
export const WebhookEventPayload = z.object({
  event: z.literal("task.updated"),
  data: z.object({
    storeId: z.string(),
    task: z.custom<import("@getpochi/livekit").Task>(),
    result: z
      .object({
        completion: z.string().optional(),
        followup: z
          .object({
            question: z.string(),
            choices: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .optional(),
  }),
});

export type WebhookEventPayload = z.infer<typeof WebhookEventPayload>;

const stub = new Hono()
  .post("/api/chat/stream", zValidator("json", ModelGatewayRequest))
  .post("/api/chat", zValidator("json", z.any()))
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
  RequireSubscriptionForSuperModels: "REQUIRE_SUBSCRIPTION_FOR_SUPER_MODELS",
};
