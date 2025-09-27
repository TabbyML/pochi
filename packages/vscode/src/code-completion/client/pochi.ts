import { getLogger } from "@getpochi/common";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
import { CodeCompletionConfig } from "../configuration";
import type { CompletionContextSegments } from "../contexts";
import { CompletionResultItem } from "../solution";
import { HttpError, isCanceledError } from "../utils/errors";
import { buildPrompt } from "../utils/prompt";
import type { CodeCompletionClientProvider } from "./type";

const logger = getLogger("CodeCompletion.PochiClient");

type CodeCompletionRequest = {
  prompt: string;
  suffix?: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  model: string;
};

type CodeCompletionResponse = {
  id: string;
  choices: {
    index: number;
    message: {
      content: string;
    };
  }[];
};

export class CodeCompletionPochiClient implements CodeCompletionClientProvider {
  private requestId = 0;

  async fetchCompletion(params: {
    segments: CompletionContextSegments;
    temperature?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<CompletionResultItem> {
    this.requestId++;
    const requestId = this.requestId;

    const prompt = buildPrompt(params.segments);
    const request: CodeCompletionRequest = {
      model: "codestral-latest",
      prompt: prompt.prompt,
      suffix: prompt.suffix,
      temperature: params.temperature,
      max_tokens: CodeCompletionConfig.value.request.maxToken,
      stop: ["\n\n", "\r\n\r\n"],
    };

    try {
      logger.trace(`[${requestId}] Completion request:`, request);
      const { jwt } = (await getVendor(
        "pochi",
      ).getCredentials()) as PochiCredentials;
      const response = await fetch(
        "https://api-gateway.getpochi.com/https/api.mistral.ai/v1/fim/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(request),
          signal: params.abortSignal,
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
      const data = (await response.json()) as CodeCompletionResponse;
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
  response: CodeCompletionResponse,
): CompletionResultItem {
  const index = 0; // api always returns 0 or 1 choice
  return new CompletionResultItem(
    response.choices[index]?.message.content ?? "",
    {
      completionId: response.id,
      choiceIndex: response.choices[index]?.index ?? index,
    },
  );
}
