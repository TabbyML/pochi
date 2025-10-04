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

const stub = new Hono()
  .post("/api/chat/stream", zValidator("json", ModelGatewayRequest))
  .post("/api/chat", zValidator("json", z.any()))
  .get("/api/models", async (c) => c.json([] as ListModelsResponse));

export type PochiApi = typeof stub;
export type PochiApiClient = ReturnType<typeof hc<PochiApi>>;
