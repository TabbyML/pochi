import { getLogger } from "@/lib/logger";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
import type * as vscode from "vscode";
import { HttpError, isCanceledError } from "../../../utils";
import {
  MaxOutputTokens,
  RequestTimeOut,
  TemperatureForManualMode,
} from "../config";
import { buildPrompt } from "../prompt";
import type { BaseSegments, ExtraSegments, FIMCompletionModel } from "../types";

const logger = getLogger("TabCompletion.Providers.FIM.PochiModel");

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

export class FIMPochiModel implements FIMCompletionModel {
  private requestId = 0;

  constructor(readonly clientId: string) {}

  async fetchCompletion(
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<string | undefined> {
    this.requestId++;
    const requestId = `client: ${this.clientId}, request: ${this.requestId}`;

    const prompt = buildPrompt(baseSegments, extraSegments);
    const request: CodeCompletionRequest = {
      model: "codestral-latest",
      prompt: prompt.prompt,
      suffix: prompt.suffix,
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
      logger.trace(`[${requestId}] Completion request:`, request);
      const pochiVendor = getVendor("pochi");
      const { jwt } = (await pochiVendor.getCredentials()) as PochiCredentials;
      const response = await fetch(
        "https://api-gateway.getpochi.com/https/api.mistral.ai/v1/fim/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(request),
          signal: combinedSignal,
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

      return getResultFromResponse(data);
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

function getResultFromResponse(response: CodeCompletionResponse) {
  return response.choices[0]?.message.content;
}
