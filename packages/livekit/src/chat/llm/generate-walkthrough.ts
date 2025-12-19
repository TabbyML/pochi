import type { LanguageModelV2 } from "@ai-sdk/provider";
import { formatters, getLogger, prompts } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { convertToModelMessages, generateText } from "ai";
import { makeDownloadFunction } from "../../store-blob";
import type { Message } from "../../types";

const logger = getLogger("generateWalkthrough");

interface GenerateWalkthroughOptions {
  store: Store;
  taskId: string;
  messages: Message[];
  getModel: () => LanguageModelV2;
  abortSignal?: AbortSignal;
}

export async function generateWalkthrough(
  options: GenerateWalkthroughOptions,
): Promise<string | undefined> {
  const { store, taskId, messages, getModel, abortSignal } = options;

  if (messages.length === 0) {
    return undefined;
  }

  try {
    const model = getModel();
    const walkthrough = await generateWalkthroughImpl(
      store,
      taskId,
      model,
      messages,
      abortSignal,
    );
    if (walkthrough && walkthrough.length > 0) {
      logger.debug(`Generated walkthrough for task ${taskId}`);
      return walkthrough;
    }
  } catch (err) {
    logger.warn("Failed to generate walkthrough", err);
  }

  return undefined;
}

async function generateWalkthroughImpl(
  store: Store,
  taskId: string,
  model: LanguageModelV2,
  inputMessages: Message[],
  abortSignal: AbortSignal | undefined,
): Promise<string> {
  const messages: Message[] = [
    ...inputMessages,
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: prompts.generateWalkthrough(),
        },
      ],
    },
  ];

  const resp = await generateText({
    providerOptions: {
      pochi: {
        taskId,
        version: globalThis.POCHI_CLIENT,
        useCase: "generate-walkthrough",
      },
    },
    model,
    prompt: convertToModelMessages(
      formatters.llm(messages, { removeSystemReminder: true }),
    ),
    experimental_download: makeDownloadFunction(store),
    abortSignal,
    maxOutputTokens: 4096,
    maxRetries: 0,
  });

  return resp.text;
}
