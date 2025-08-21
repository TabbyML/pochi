import { formatters, getLogger, prompts } from "@getpochi/common";
import type { Message, RequestData } from "../types";
import { requestLLM } from "./llm";

const logger = getLogger("compactTask");

export async function compactTask({
  getLLM,
  messages,
  abortSignal,
  overwrite,
}: {
  getLLM: () => RequestData["llm"];
  messages: Message[];
  abortSignal?: AbortSignal;
  overwrite: boolean;
}): Promise<string | undefined> {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return;
  }

  if (lastMessage.role === "user") {
    if (lastMessage.metadata?.kind === "user" && lastMessage.metadata.compact) {
      // DO Nothing.
    } else {
      return;
    }
  }

  const llm = getLLM();
  try {
    const text = prompts.inlineCompact(
      await createSummary(llm, abortSignal, messages.slice(0, -1)),
      messages.length - 1,
    );
    if (overwrite) {
      lastMessage.parts.unshift({
        type: "text",
        text,
      });
    }
    return text;
  } catch (err) {
    logger.warn("Failed to create summary", err);
  }
}

async function createSummary(
  llm: RequestData["llm"],
  abortSignal: AbortSignal | undefined,
  inputMessages: Message[],
) {
  const messages: Message[] = formatters.llm(
    [
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
    ],
    {
      removeSystemReminder: true,
    },
  );

  const stream = await requestLLM(undefined, llm, {
    messages,
    system: prompts.compact(),
    abortSignal,
  });

  const reader = stream.getReader();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();

      // If 'done' is true, the stream has finished.
      if (done) {
        break;
      }

      if (value.type === "text-delta") {
        text += value.delta;
      }
    }
  } finally {
    // It's important to release the lock on the reader
    // so the stream can be used elsewhere if needed.
    reader.releaseLock();
  }

  return text;
}
