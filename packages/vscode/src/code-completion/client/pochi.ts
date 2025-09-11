import type { ApiClient } from "@/lib/auth-client";
import { getLogger } from "@getpochi/common";
import type {
  CodeCompletionFIMRequest,
  CodeCompletionFIMResponse,
} from "@getpochi/common/pochi-api";
import { container } from "tsyringe";
import { CodeCompletionConfig } from "../configuration";
import type { CompletionContextSegments } from "../contexts";
import { CompletionResultItem } from "../solution";
import { HttpError, isCanceledError } from "../utils/errors";
import { buildPrompt } from "../utils/prompt";
import type { CodeCompletionClientProvider } from "./type";

const logger = getLogger("CodeCompletion.PochiClient");

export class CodeCompletionPochiClient implements CodeCompletionClientProvider {
  private apiClient: ApiClient;
  private requestId = 0;

  constructor() {
    this.apiClient = container.resolve("ApiClient");
  }

  async fetchCompletion(params: {
    segments: CompletionContextSegments;
    temperature?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<CompletionResultItem> {
    this.requestId++;
    const requestId = this.requestId;

    const prompt = buildPrompt(params.segments);
    const request: CodeCompletionFIMRequest = {
      prompt: prompt.prompt,
      suffix: prompt.suffix,
      temperature: params.temperature,
      maxTokens: CodeCompletionConfig.value.request.maxToken,
      stop: ["\n\n", "\r\n\r\n"],
    };

    try {
      logger.trace(`[${requestId}] Completion request:`, request);
      const response = await this.apiClient.api.code.fim.completion.$post(
        {
          json: request,
        },
        {
          init: {
            signal: params.abortSignal,
          },
        },
      );
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

function createCompletionResultItemFromResponse(
  response: CodeCompletionFIMResponse,
): CompletionResultItem {
  const index = 0; // api always returns 0 or 1 choice
  return new CompletionResultItem(response.choices[index]?.text ?? "", {
    completionId: response.id,
    choiceIndex: response.choices[index]?.index ?? index,
  });
}
