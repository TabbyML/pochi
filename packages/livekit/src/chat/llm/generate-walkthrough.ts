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
  title: string | null;
  messages: Message[];
  getModel: () => LanguageModelV2;
  abortSignal?: AbortSignal;
}

export async function generateWalkthrough(options: GenerateWalkthroughOptions) {
  const walkthrough = await generateWalkthroughImpl(options);
  if (walkthrough !== undefined) {
    logger.debug(`Generated walkthrough for task ${options.taskId}`);
  }
  return walkthrough;
}

async function generateWalkthroughImpl({
  store,
  taskId,
  title,
  messages,
  getModel,
  abortSignal,
}: GenerateWalkthroughOptions): Promise<string | undefined> {
  try {
    const model = getModel();
    const walkthrough = await generateWalkthroughContent(
      store,
      taskId,
      title,
      model,
      messages,
      abortSignal,
    );
    if (walkthrough.length > 0) {
      return walkthrough;
    }
  } catch (err) {
    logger.warn("Failed to generate walkthrough", err);
  }

  return undefined;
}

async function generateWalkthroughContent(
  store: Store,
  taskId: string,
  title: string | null,
  model: LanguageModelV2,
  inputMessages: Message[],
  abortSignal: AbortSignal | undefined,
) {
  const messages: Message[] = [
    ...inputMessages,
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: prompts.generateWalkthrough({ taskId, title }),
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
