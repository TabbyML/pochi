import type { TabCompletionFIMProviderSettings } from "@/integrations/configuration";
import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import type * as vscode from "vscode";
import { HttpError, isCanceledError } from "../../../utils";
import {
  MaxOutputTokens,
  RequestTimeOut,
  TemperatureForManualMode,
} from "../config";
import { formatPrompt } from "../prompt";
import type { BaseSegments, ExtraSegments, FIMCompletionModel } from "../types";

const logger = getLogger("TabCompletion.Providers.FIM.OpenAiModel");

export type OpenAIProviderConfig = Extract<
  TabCompletionFIMProviderSettings,
  { type: "FIM:openai" }
>;

export class FIMOpenAIModel implements FIMCompletionModel {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;
  private readonly promptTemplate: string;

  constructor(config: OpenAIProviderConfig) {
    this.baseUrl = config.baseURL.trim();
    if (!this.baseUrl) {
      logger.error(
        "OpenAI baseURL is not configured. Code completion will not work.",
      );
    }
    this.apiKey =
      config.apiKey?.trim() || process.env.POCHI_CODE_COMPLETION_OPENAI_API_KEY;
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
    if (!this.baseUrl) {
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

    const signals = [AbortSignal.timeout(RequestTimeOut)];
    if (token) {
      const abortController = new AbortController();
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      token.onCancellationRequested(() => abortController.abort());
      signals.push(abortController.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    try {
      logger.trace(
        "Request:",
        logToFileObject({
          requestId,
          request,
        }),
      );

      const response = await fetch(`${this.baseUrl}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey || ""}`,
        },
        body: JSON.stringify(request),
        signal: combinedSignal,
      });

      logger.trace(
        "Response status:",
        logToFileObject({
          requestId,
          response: response.status,
        }),
      );

      if (!response.ok) {
        throw new HttpError({
          status: response.status,
          statusText: response.statusText,
          text: await response.text(),
        });
      }
      const data = await response.json();

      logger.trace(
        "Response:",
        logToFileObject({
          requestId,
          response: data,
        }),
      );

      return getResultFromResponse(data);
    } catch (error) {
      if (isCanceledError(error)) {
        logger.trace("Request canceled.", logToFileObject({ requestId }));
      } else {
        logger.debug("Request failed.", logToFileObject({ requestId, error }));
      }
      throw error; // rethrow error
    }
  }
}

function getDefaultPromptTemplate(model?: string | undefined): string {
  if (model?.toLocaleLowerCase().startsWith("qwen")) {
    return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
  }
  return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
}

function getResultFromResponse(response: unknown) {
  if (
    typeof response !== "object" ||
    response === null ||
    !("choices" in response) ||
    !Array.isArray((response as { choices: unknown }).choices) ||
    (response as { choices: unknown[] }).choices.length === 0
  ) {
    return undefined;
  }

  const index = 0;
  const choice = (response as { choices: unknown[] }).choices[index];
  if (typeof choice !== "object" || choice === null) {
    return undefined;
  }

  const text =
    "text" in choice && typeof (choice as { text: unknown }).text === "string"
      ? (choice as { text: string }).text
      : undefined;

  return text;
}
