import { getLogger } from "@getpochi/common";
import { CodeCompletionConfig } from "../configuration";
import type { CompletionContextSegments } from "../contexts";
import { CompletionResultItem, emptyCompletionResultItem } from "../solution";
import { HttpError, isCanceledError } from "../utils/errors";
import { formatPrompt } from "../utils/prompt";
import type { CodeCompletionClientProvider, ProviderConfig } from "./type";

const logger = getLogger("CodeCompletion.OpenAIClient");

export type OpenAIProviderConfig = Extract<ProviderConfig, { type: "openai" }>;

export class CodeCompletionOpenAIClient
  implements CodeCompletionClientProvider
{
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;
  private readonly promptTemplate: string;

  private requestId = 0;

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

  async fetchCompletion(params: {
    segments: CompletionContextSegments;
    temperature?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<CompletionResultItem> {
    if (!this.baseUrl) {
      return emptyCompletionResultItem;
    }

    this.requestId++;
    const requestId = this.requestId;

    const request = {
      prompt: formatPrompt(this.promptTemplate, params.segments),
      model: this.model,
      temperature: params.temperature,
      max_tokens: CodeCompletionConfig.value.request.maxToken,
      stop: ["\n\n", "\r\n\r\n"],
    };

    try {
      logger.trace(`[${requestId}] Completion request:`, request);
      const response = await fetch(`${this.baseUrl}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey || ""}`,
        },
        body: JSON.stringify(request),
        signal: params.abortSignal,
      });
      logger.trace(
        `[${requestId}] Completion response status: ${response.status}.`,
      );

      if (!response.ok) {
        throw new HttpError({
          status: response.status,
          statusText: response.statusText,
          text: await response.text(),
        });
      }
      const data = await response.json();
      logger.trace(`[${requestId}] Completion response data:`, data);

      return createCompletionResultItemFromResponse(data);
    } catch (error) {
      if (isCanceledError(error)) {
        logger.debug(`[${requestId}] Completion request canceled.`);
      } else {
        logger.debug(`[${requestId}] Completion request failed.`, error);
      }
      throw error; // rethrow error
    }
  }
}

function getDefaultPromptTemplate(model?: string | undefined): string {
  if (model?.toLocaleLowerCase().startsWith("qwen")) {
    return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
  }
  // FIXME(zhiming): improve default prompt template
  return "<|fim_prefix|>{{prefix}}<|fim_suffix|>{{suffix}}<|fim_middle|>";
}

function createCompletionResultItemFromResponse(
  response: unknown,
): CompletionResultItem {
  if (
    typeof response !== "object" ||
    response === null ||
    !("choices" in response) ||
    !Array.isArray((response as { choices: unknown }).choices) ||
    (response as { choices: unknown[] }).choices.length === 0
  ) {
    return emptyCompletionResultItem;
  }

  const index = 0;
  const choice = (response as { choices: unknown[] }).choices[index];
  if (typeof choice !== "object" || choice === null) {
    return emptyCompletionResultItem;
  }

  const text =
    "text" in choice && typeof (choice as { text: unknown }).text === "string"
      ? (choice as { text: string }).text
      : "";
  const choiceIndex =
    "index" in choice &&
    typeof (choice as { index: unknown }).index === "number"
      ? (choice as { index: number }).index
      : index;

  const completionId =
    "id" in response && typeof (response as { id: unknown }).id === "string"
      ? (response as { id: string }).id
      : "";

  return new CompletionResultItem(text, {
    completionId,
    choiceIndex,
  });
}
