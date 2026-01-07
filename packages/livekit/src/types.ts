import type {
  LanguageModelV2,
  LanguageModelV2FinishReason,
} from "@ai-sdk/provider";
import { Environment } from "@getpochi/common";
import { GoogleVertexModel } from "@getpochi/common/configuration";
import type {
  ActiveSelection,
  Review,
  UserEdits,
} from "@getpochi/common/vscode-webui-bridge";
import { type ClientTools, McpTool } from "@getpochi/tools";
import type { InferUITools, UIMessage } from "ai";
import z from "zod/v4";
import type { tables } from "./livestore/default-schema";

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
  reviews: {
    reviews: Review[];
  };
  "user-edits": {
    userEdits: UserEdits;
  };
  "active-selection": {
    activeSelection: ActiveSelection;
  };
  "bash-outputs": {
    bashOutputs: BashOutputs;
  };
};

export type UITools = InferUITools<ClientTools>;

export type Message = UIMessage<Metadata, DataParts, UITools>;

const BashOutputs = z.object({
  outputs: z.array(z.string()).describe("Bash outputs"),
});

export type BashOutputs = z.infer<typeof BashOutputs>;


const RequestData = z.object({
  environment: Environment.optional(),
  llm: z.discriminatedUnion("type", [
    z.object({
      id: z.string(),
      type: z.literal("openai"),
      modelId: z.string(),
      baseURL: z.string().optional(),
      apiKey: z.string().optional(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
    z.object({
      id: z.string(),
      type: z.literal("openai-responses"),
      modelId: z.string(),
      baseURL: z.string().optional(),
      apiKey: z.string().optional(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
    z.object({
      id: z.string(),
      type: z.literal("anthropic"),
      modelId: z.string(),
      baseURL: z.string().optional(),
      apiKey: z.string().optional(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
    z.object({
      id: z.string(),
      type: z.literal("google-vertex-tuning"),
      modelId: z.string(),
      vertex: GoogleVertexModel,
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
    z.object({
      id: z.string(),
      type: z.literal("ai-gateway"),
      modelId: z.string(),
      apiKey: z.string().optional(),
      contextWindow: z.number().describe("Context window of the model."),
      maxOutputTokens: z.number().describe("Max output tokens of the model."),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
    }),
    z.object({
      id: z.string(),
      type: z.literal("vendor"),
      useToolCallMiddleware: z
        .boolean()
        .optional()
        .describe("Whether to use tool call middleware"),
      getModel: z.custom<() => LanguageModelV2>(),
      contentType: z
        .array(z.string())
        .optional()
        .describe("The supported mime types model can handle"),
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
