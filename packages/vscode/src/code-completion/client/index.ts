import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType:
import {
  type PochiAdvanceSettings,
  PochiConfiguration,
} from "../../integrations/configuration";
import { CodeCompletionConfig } from "../configuration";
import type { CompletionContextSegments } from "../contexts";
import type { CompletionResultItem } from "../solution";
import { isCanceledError, isTimeoutError } from "../utils/errors";
import { CodeCompletionOpenAIClient } from "./openai";
import { CodeCompletionPochiClient } from "./pochi";
import type { CodeCompletionClientProvider } from "./type";

const logger = getLogger("CodeCompletion.Client");

function createTimeOutSignal(): AbortSignal {
  return AbortSignal.timeout(CodeCompletionConfig.value.request.timeout);
}

@injectable()
@singleton()
export class CodeCompletionClient {
  private provider: CodeCompletionClientProvider;

  constructor(private readonly pochiConfiguration: PochiConfiguration) {
    this.provider = this.createProvider(
      pochiConfiguration.advancedSettings.value.codeCompletionProvider,
    );
    this.pochiConfiguration.advancedSettings.subscribe((value) => {
      this.provider = this.createProvider(value.codeCompletionProvider);
    });
  }

  private createProvider(
    providerConfig: PochiAdvanceSettings["codeCompletionProvider"],
  ): CodeCompletionClientProvider {
    if (providerConfig?.type === "openai") {
      logger.debug("Using OpenAI code completion provider");
      return new CodeCompletionOpenAIClient();
    }
    logger.debug("Using Pochi code completion provider");
    return new CodeCompletionPochiClient();
  }

  async fetchCompletion(
    segments: CompletionContextSegments,
    temperature?: number | undefined,
    token?: vscode.CancellationToken | undefined,
    // set to track latency, the properties in latencyStats object will be updated in this function
    latencyStats?: {
      latency?: number; // ms, undefined means no data, timeout or canceled
      canceled?: boolean;
      timeout?: boolean;
    },
  ): Promise<CompletionResultItem> {
    const signals = [createTimeOutSignal()];
    if (token) {
      const abortController = new AbortController();
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      token.onCancellationRequested(() => abortController.abort());
      signals.push(abortController.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    const requestStartedAt = performance.now();
    try {
      const result = await this.provider.fetchCompletion({
        segments,
        temperature,
        abortSignal: combinedSignal,
      });

      if (latencyStats) {
        latencyStats.latency = performance.now() - requestStartedAt;
      }
      return result;
    } catch (error) {
      if (isCanceledError(error)) {
        if (latencyStats) {
          latencyStats.canceled = true;
        }
      } else if (isTimeoutError(error)) {
        if (latencyStats) {
          latencyStats.timeout = true;
        }
      }

      if (latencyStats) {
        latencyStats.latency = undefined;
      }
      throw error; // rethrow error
    }
  }
}
