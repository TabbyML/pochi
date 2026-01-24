import type { TabCompletionFIMProviderSettings } from "@/integrations/configuration";
import type * as vscode from "vscode";
import { OpenAIFetcher } from "../../fetchers";
import {
  MaxOutputTokens,
  RequestTimeOut,
  TemperatureForManualMode,
} from "../config";
import { formatPrompt } from "../prompt";
import type { BaseSegments, ExtraSegments, FIMCompletionModel } from "../types";

export type OpenAIProviderConfig = Extract<
  TabCompletionFIMProviderSettings,
  { type: "FIM:openai" }
>;

export class FIMOpenAIModel implements FIMCompletionModel {
  private readonly fetcher: OpenAIFetcher;
  private readonly model: string | undefined;
  private readonly promptTemplate: string;

  constructor(config: OpenAIProviderConfig) {
    this.fetcher = new OpenAIFetcher(config);
    this.model = config.model?.trim();
    this.promptTemplate =
      config.promptTemplate?.trim() || getDefaultPromptTemplate(this.model);
  }

  async fetchCompletion(
    requestId: string,
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<string | undefined> {
    if (!this.fetcher) {
      return undefined;
    }

    const request = {
      prompt: formatPrompt(this.promptTemplate, baseSegments, extraSegments),
      model: this.model,
      temperature: baseSegments.isManually
        ? TemperatureForManualMode
        : undefined,
      max_tokens: MaxOutputTokens,
      stop: ["\n\n", "\r\n\r\n"],
    };

    const data = await this.fetcher.fetchCompletion(
      requestId,
      request,
      token,
      RequestTimeOut,
    );

    return data?.text;
  }
}

function getDefaultPromptTemplate(model?: string | undefined): string {
  if (model?.toLocaleLowerCase().startsWith("qwen")) {
    return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
  }
  return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
}
