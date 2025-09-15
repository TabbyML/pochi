import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import type { ThreadAbortSignalSerialization } from "@quilted/threads";

export interface VSCodeLmModel {
  vendor?: string;
  family?: string;
  version?: string;
  id?: string;
  contextWindow: number;
}

export interface VSCodeLmRequestOptions {
  model: Omit<VSCodeLmModel, "contextWindow">;
  prompt: LanguageModelV2Prompt;
  stopSequences?: string[];
  abortSignal?: ThreadAbortSignalSerialization;
}

export type VSCodeLmRequestCallback = (
  chunk:
    | {
        type: "text-delta";
        text: string;
      }
    | {
        type: "error";
        error: string;
      },
) => Promise<void>;

export type VSCodeLmRequest = (
  options: VSCodeLmRequestOptions,
  onChunk: VSCodeLmRequestCallback,
) => Promise<void>;
