import { formatPlaceholders } from "@/code-completion/utils/strings";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import { type CallSettings, type Prompt, generateText } from "ai";
import type { NESContextSegments } from "../contexts";
import type { NESResponseItem } from "../types";
import type { NESClientProvider, ProviderConfig } from "./type";

const logger = getLogger("NES.GoogleVertexTuningClient");

export type GoogleVertexTuningProviderConfig = Extract<
  ProviderConfig,
  { type: "google-vertex-tuning" }
>;

export class NESGoogleVertexTuningClient implements NESClientProvider {
  private readonly vertexModel: LanguageModelV2 | undefined;
  private requestId = 0;

  constructor(config: GoogleVertexTuningProviderConfig) {
    const model = config.model.trim();
    const vertex = config.vertex;
    if (model && vertex) {
      this.vertexModel = createVertexModel(vertex, model);
    } else {
      logger.error(
        "Google Vertex tuning model is not properly configured. Code completion will not work.",
      );
      this.vertexModel = undefined;
    }
  }

  async fetchCompletion(params: {
    segments: NESContextSegments;
    abortSignal?: AbortSignal | undefined;
  }): Promise<NESResponseItem | undefined> {
    if (!this.vertexModel) {
      return undefined;
    }

    this.requestId++;
    const requestId = this.requestId;

    const request: CallSettings & Prompt = {
      system: formatPlaceholders(SystemPromptTemplate, {
        edits: params.segments.edits.join("\n\n"),
      }),
      prompt: formatPlaceholders(UserPromptTemplate, {
        filepath: params.segments.filepath,
        prefix: params.segments.prefix,
        editableRegionPrefix: params.segments.editableRegionPrefix,
        editableRegionSuffix: params.segments.editableRegionSuffix,
        suffix: params.segments.suffix,
      }),
      maxOutputTokens: 2048,
      stopSequences: ["<|editable_region_end|>"],
    };

    logger.trace(`[${requestId}] Completion request:`, request);

    const result = await generateText({
      ...request,
      model: this.vertexModel,
      abortSignal: params.abortSignal,
    });

    logger.trace(`[${requestId}] Completion response:`, result.response.body);

    return {
      text: extractResult(result.text),
    };
  }
}

function extractResult(text: string): string {
  const startIndex =
    text.indexOf("<|editable_region_start|>") +
    "<|editable_region_start|>".length;
  const endIndex = text.indexOf("<|editable_region_end|>");
  return text.slice(startIndex, endIndex);
}

const SystemPromptTemplate =
  "You are an AI coding assistant that helps with code completion and editing. You will be given a code snippet with an editable region marked.\nYour task is to complete or modify the code within that region based on the following events that happened in past:\n\nUser edits:\n\n```diff\n{{edits}}\n```\n";
const UserPromptTemplate =
  "```{{filepath}}\n{{prefix}}<|editable_region_start|>{{editableRegionPrefix}}<|user_cursor_is_here|>{{editableRegionSuffix}}<|editable_region_end|>{{suffix}}\n```";
