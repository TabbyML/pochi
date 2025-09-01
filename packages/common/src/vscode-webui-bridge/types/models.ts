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

export type VSCodeLmRequest = (
  options: VSCodeLmRequestOptions,
  onChunk: (chunk: string) => Promise<void>,
) => Promise<void>;
