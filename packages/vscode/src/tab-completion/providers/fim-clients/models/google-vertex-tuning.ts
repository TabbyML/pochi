import type { TabCompletionFIMProviderSettings } from "@/integrations/configuration";
import { getLogger } from "@/lib/logger";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import { type CallSettings, type Prompt, generateText } from "ai";
import type * as vscode from "vscode";
import { isCanceledError } from "../../../utils";
import {
  MaxOutputTokens,
  RequestTimeOut,
  TemperatureForManualMode,
} from "../config";
import { formatPrompt } from "../prompt";
import type { BaseSegments, ExtraSegments, FIMCompletionModel } from "../types";

const logger = getLogger("TabCompletion.Providers.FIM.GoogleVertexTuningModel");

export type GoogleVertexTuningProviderConfig = Extract<
  TabCompletionFIMProviderSettings,
  { type: "FIM:google-vertex-tuning" }
>;

export class FIMGoogleVertexTuningModel implements FIMCompletionModel {
  private readonly model: LanguageModelV2 | undefined;
  private readonly systemPrompt: string;
  private readonly promptTemplate: string;

  private requestId = 0;

  constructor(
    readonly clientId: string,
    config: GoogleVertexTuningProviderConfig,
  ) {
    const modelConfig = config.model.trim();
    const vertex = config.vertex;
    if (modelConfig && vertex) {
      this.model = createVertexModel(vertex, modelConfig);
    } else {
      this.model = undefined;
    }
    if (!this.model) {
      logger.error(
        "Google Vertex tuning model is not properly configured. Code completion will not work.",
      );
    }

    this.systemPrompt = config.systemPrompt?.trim() || DefaultSystemPrompt;
    this.promptTemplate =
      config.promptTemplate?.trim() || DefaultPromptTemplate;
  }

  async fetchCompletion(
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<string | undefined> {
    if (!this.model) {
      return undefined;
    }

    this.requestId++;
    const requestId = `client: ${this.clientId}, request: ${this.requestId}`;

    const request: CallSettings & Prompt = {
      system: this.systemPrompt,
      prompt: formatPrompt(this.promptTemplate, baseSegments, extraSegments),
      temperature: baseSegments.isManually
        ? TemperatureForManualMode
        : undefined,
      maxOutputTokens: MaxOutputTokens,
      stopSequences: ["\n\n", "\r\n\r\n"],
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

      const result = await generateText({
        ...request,
        model: this.model,
        abortSignal: combinedSignal,
      });

      logger.trace(`[${requestId}] Completion response:`, result.response.body);

      return result.text;
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

const DefaultSystemPrompt =
  "You are a code completion assistant. You will be given a prefix and a suffix of code. Your task is to predict the middle part of the code that connects the prefix and suffix logically and syntactically. Ensure that the completed code is coherent and functional.";
const DefaultPromptTemplate =
  "Here is the prefix: {{prefix}} Here is the suffix: {{suffix}} Please predict the middle.";
