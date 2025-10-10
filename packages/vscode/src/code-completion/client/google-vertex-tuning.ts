import type { LanguageModelV2 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import { type CallSettings, type Prompt, generateText } from "ai";
import { CodeCompletionConfig } from "../configuration";
import type { CompletionContextSegments } from "../contexts";
import { CompletionResultItem, emptyCompletionResultItem } from "../solution";
import { isCanceledError } from "../utils/errors";
import { formatPrompt } from "../utils/prompt";
import type { CodeCompletionClientProvider, ProviderConfig } from "./type";

const logger = getLogger("CodeCompletion.GoogleVertexTuningClient");

export type GoogleVertexTuningProviderConfig = Extract<
  ProviderConfig,
  { type: "google-vertex-tuning" }
>;

export class CodeCompletionGoogleVertexTuningClient
  implements CodeCompletionClientProvider
{
  private readonly vertexModel: LanguageModelV2 | undefined;
  private readonly systemPrompt: string;
  private readonly promptTemplate: string;

  private requestId = 0;

  constructor(config: GoogleVertexTuningProviderConfig) {
    const model = config.model.trim();
    const vertex = config.vertex;
    if (model && vertex) {
      this.vertexModel = createVertexModel(vertex, model);
    } else {
      logger.error(
        "Google Vertex tuning model is not properly configured. Code completion will not work.",
      );
      this.vertexModel = undefined;
    }
    this.systemPrompt = config.systemPrompt?.trim() || DefaultSystemPrompt;
    this.promptTemplate =
      config.promptTemplate?.trim() || DefaultPromptTemplate;
  }

  async fetchCompletion(params: {
    segments: CompletionContextSegments;
    temperature?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<CompletionResultItem> {
    if (!this.vertexModel) {
      return emptyCompletionResultItem;
    }

    this.requestId++;
    const requestId = this.requestId;

    const request: CallSettings & Prompt = {
      system: this.systemPrompt,
      prompt: formatPrompt(this.promptTemplate, params.segments),
      temperature: params.temperature,
      maxOutputTokens: CodeCompletionConfig.value.request.maxToken,
      stopSequences: ["\n\n", "\r\n\r\n"],
    };

    try {
      logger.trace(`[${requestId}] Completion request:`, request);

      const result = await generateText({
        ...request,
        model: this.vertexModel,
        abortSignal: params.abortSignal,
      });

      logger.trace(`[${requestId}] Completion response:`, result.response.body);

      return new CompletionResultItem(result.text, {
        completionId: result.response.id,
        choiceIndex: 0,
      });
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
