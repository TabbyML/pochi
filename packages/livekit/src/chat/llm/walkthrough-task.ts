import type { LanguageModelV2 } from "@ai-sdk/provider";
import { formatters, getLogger, prompts } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { convertToModelMessages, generateText } from "ai";
import { makeDownloadFunction } from "../../store-blob";
import type { Message } from "../../types";

const logger = getLogger("walkthroughTask");

export async function walkthroughTask({
  store,
  taskId,
  model,
  messages,
  abortSignal,
}: {
  store: Store;
  taskId: string;
  model: LanguageModelV2;
  messages: Message[];
  abortSignal?: AbortSignal;
}): Promise<string | undefined> {
  if (messages.length < 1) {
    throw new Error("No messages to walkthrough");
  }

  try {
    const text = prompts.inlineCompact(
      await generateWalkthrough(
        store,
        taskId,
        model,
        abortSignal,
        messages.slice(0, -1),
      ),
      messages.length - 1,
    );

    return text;
  } catch (err) {
    logger.warn("Failed to create walkthrough", err);
  }
}

async function generateWalkthrough(
  store: Store,
  taskId: string,
  model: LanguageModelV2,
  abortSignal: AbortSignal | undefined,
  inputMessages: Message[],
) {
  const messages: Message[] = [
    ...inputMessages,
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: 'Please create "walkthrough" artifacts for the conversation above message. This type of artifact includes a concise summary of the changes that have been made to remind the user of what has happened in the active conversation.',
          // AT "2025/12/15 16:56"
          // TODO MAYBE (╭ರ_•́)
          // fine tune this prompt
        },
      ],
    },
  ];

  const resp = await generateText({
    providerOptions: {
      pochi: {
        taskId,
        version: globalThis.POCHI_CLIENT,
        useCase: "walkthrough-task",
      },
    },
    model,
    prompt: convertToModelMessages(
      formatters.llm(messages, {
        removeSystemReminder: true,
      }),
    ),
    experimental_download: makeDownloadFunction(store),
    abortSignal,
    maxOutputTokens: 3_000,
    maxRetries: 0,
  });

  return resp.text;
}
