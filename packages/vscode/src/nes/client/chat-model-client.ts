import { formatPlaceholders } from "@/code-completion/utils/strings";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import { type CallSettings, type Prompt, generateText } from "ai";
import type { NESPromptSegments } from "../contexts";
import type { NESResponseItem } from "../types";
import type { NESClientProvider, ProviderConfig } from "./type";

const logger = getLogger("NES.ChatModelClient");

export type GoogleVertexTuningProviderConfig = Extract<
  ProviderConfig,
  { type: "google-vertex-tuning" }
>;

export class NESChatModelClient implements NESClientProvider {
  private requestId = 0;

  constructor(private readonly model: LanguageModelV2) {}

  async fetchCompletion(params: {
    segments: NESPromptSegments;
    abortSignal?: AbortSignal | undefined;
  }): Promise<NESResponseItem | undefined> {
    if (!this.model) {
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
      model: this.model,
      abortSignal: params.abortSignal,
    });

    logger.trace(`[${requestId}] Completion response:`, result.response.body);

    if (result.finishReason !== "stop") {
      return undefined;
    }

    const extractedResult = extractResult(result.text, params.segments);
    if (extractedResult) {
      return {
        textEdit: {
          changes: [
            {
              range: {
                start: params.segments.editableRegionStart,
                end: params.segments.editableRegionEnd,
              },
              text: extractedResult,
            },
          ],
        },
      };
    }

    return undefined;
  }
}

function extractResult(text: string, segments: NESPromptSegments) {
  const startTagIndex = text.indexOf("<|editable_region_start|>");
  if (startTagIndex === -1) {
    // No start tag found
    return undefined;
  }

  const afterEndTagText = `${segments.suffix}\n\`\`\``;
  if (text.endsWith(afterEndTagText)) {
    // Unexpected output end
    return undefined;
  }

  const resultRegionStart = startTagIndex + "<|editable_region_start|>".length;
  const endTagIndex = text.indexOf("<|editable_region_end|>");
  let result =
    endTagIndex === -1
      ? text.slice(resultRegionStart)
      : text.slice(resultRegionStart, endTagIndex);
  result = result.replace("<|user_cursor_is_here|>", "");

  const contextText =
    segments.prefix +
    segments.editableRegionPrefix +
    segments.editableRegionSuffix +
    segments.suffix;
  if (result.split("\n").length > 3 && contextText.includes(result)) {
    // Duplication detected
    return undefined;
  }

  return result;
}

const SystemPromptTemplate =
  "You are an AI coding assistant that helps with code completion and editing. You will be given a code snippet with an editable region marked.\nYour task is to complete or modify the code within that region based on the following events that happened in past.\nYou should not undo or revert the edits. \n\nUser edits:\n\n```diff\n{{edits}}\n```\n";
const UserPromptTemplate =
  "```{{filepath}}\n{{prefix}}<|editable_region_start|>{{editableRegionPrefix}}<|user_cursor_is_here|>{{editableRegionSuffix}}<|editable_region_end|>{{suffix}}\n```";
