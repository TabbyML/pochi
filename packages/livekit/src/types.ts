import type { LanguageModelV2FinishReason } from "@ai-sdk/provider";
import { Environment } from "@getpochi/common";
import type { PochiApiClient } from "@getpochi/common/pochi-api";
import type { VSCodeLmRequest } from "@getpochi/common/vscode-webui-bridge";
import { type ClientTools, McpTool } from "@getpochi/tools";
import type { InferUITools, UIMessage } from "ai";
import z from "zod";
import type { tables } from "./livestore/schema";

export type Metadata =
  | {
      kind: "assistant";
      totalTokens: number;
      finishReason: LanguageModelV2FinishReason;
    }
  | {
      kind: "user";
      compact?: boolean;
    };

export type DataParts = {
  checkpoint: {
    commit: string;
  };
};

export type UITools = InferUITools<ClientTools>;

export type Message = UIMessage<Metadata, DataParts, UITools>;

const RequestData = z.object({
  environment: Environment.optional(),
  llm: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("openai"),
      modelId: z.string(),
      baseURL: z.string(),
      apiKey: z.string().optional(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
    }),
    z.object({
      type: z.literal("google-vertex-tuning"),
      location: z.string(),
      modelId: z.string(),
      credentials: z.string(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
    }),
    z.object({
      type: z.literal("pochi"),
      modelId: z.string().optional(),
      apiClient: z.custom<PochiApiClient>(),
    }),
    z.object({
      type: z.literal("vscode"),
      modelId: z.string(),
      vendor: z.string().optional(),
      family: z.string().optional(),
      version: z.string().optional(),
      id: z.string().optional(),
      vscodeLmRequest: z.custom<VSCodeLmRequest>(),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
    }),
  ]),
  mcpToolSet: z
    .record(
      z.string().describe("Name of the MCP tool."),
      McpTool.describe("Definition of the MCP tool."),
    )
    .optional()
    .describe("MCP tools available for this request."),
});

export type RequestData = z.infer<typeof RequestData>;

export type Task = typeof tables.tasks.Type;
