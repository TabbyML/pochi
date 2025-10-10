import type { LanguageModelV2 } from "@ai-sdk/provider";
import { constants, formatters, getLogger, prompts } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { convertToModelMessages, generateText } from "ai";
import { makeDownloadFunction } from "../../store-blob";
import type { Message } from "../../types";

const logger = getLogger("compactTask");

export async function compactTask({
  store,
  taskId,
  model,
  messages,
  abortSignal,
  inline,
}: {
  store: Store;
  taskId: string;
  model: LanguageModelV2;
  messages: Message[];
  abortSignal?: AbortSignal;
  inline?: boolean;
}): Promise<string | undefined> {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new Error("No messages to compact");
  }

  try {
    const text = prompts.inlineCompact(
      await createSummary(
        store,
        taskId,
        model,
        abortSignal,
        messages.slice(0, -1),
      ),
      messages.length - 1,
    );
    if (inline) {
      lastMessage.parts.unshift({
        type: "text",
        text,
      });
      return;
    }
    return text;
  } catch (err) {
    logger.warn("Failed to create summary", err);
  }
}

async function createSummary(
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
          text: "Please provide a concise summary of the conversation above, focusing on key topics, decisions, and important context that should be preserved. It shall contains no more than 2000 words",
        },
      ],
    },
  ];

  const resp = await generateText({
    headers: {
      [constants.PochiTaskIdHeader]: taskId,
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
