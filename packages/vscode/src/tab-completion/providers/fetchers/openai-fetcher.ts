import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import type * as vscode from "vscode";
import { HttpError, isCanceledError } from "../../utils";
import type { Fetcher, RequestBody, ResponseBody } from "./types";

const logger = getLogger("TabCompletion.Providers.Base.OpenAIFetcher");

export class OpenAIFetcher implements Fetcher {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly model: string | undefined;

  constructor(config: {
    baseURL: string;
    apiKey?: string | undefined;
    model?: string | undefined;
  }) {
    this.baseUrl = config.baseURL.trim();
    if (!this.baseUrl) {
      logger.error("OpenAI baseURL is not configured.");
    }
    this.apiKey =
      config.apiKey?.trim() || process.env.POCHI_CODE_COMPLETION_OPENAI_API_KEY;
    this.model = config.model?.trim();
  }

  async fetchCompletion(
    requestId: string,
    requestBody: RequestBody,
    token?: vscode.CancellationToken | undefined,
    timeout = 60000,
  ): Promise<ResponseBody | undefined> {
    if (!this.baseUrl) {
      return undefined;
    }

    const request = {
      model: this.model,
      ...requestBody,
    };

    const signals = [AbortSignal.timeout(timeout)];
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

      if (
        typeof data !== "object" ||
        data === null ||
        !("id" in data) ||
        !("choices" in data) ||
        !Array.isArray((data as { choices: unknown }).choices) ||
        (data as { choices: unknown[] }).choices.length === 0
      ) {
        return undefined;
      }

      const id = data.id as string;
      const choice = (data as { choices: unknown[] }).choices[0];

      if (typeof choice !== "object" || choice === null) {
        return undefined;
      }

      const text =
        "text" in choice &&
        typeof (choice as { text: unknown }).text === "string"
          ? (choice as { text: string }).text
          : undefined;
      const finish_reason =
        "finish_reason" in choice &&
        typeof (choice as { finish_reason: unknown }).finish_reason === "string"
          ? (choice as { finish_reason: string }).finish_reason
          : undefined;

      if (text === undefined || finish_reason === undefined) {
        return undefined;
      }

      return { id, text, finish_reason };
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
