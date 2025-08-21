import { formatters, getLogger, prompts } from "@getpochi/common";
import type { Message, RequestData } from "../types";
import { requestLLM } from "./llm";

const logger = getLogger("generateTaskTitle");

interface GenerateTaskTitleOptions {
  title: string | null;
  messages: Message[];
  getLLM: () => RequestData["llm"];
  abortSignal?: AbortSignal;
}

export async function generateTaskTitle(options: GenerateTaskTitleOptions) {
  const { title } = options;
  const newTitle = await generateTaskTitleImpl(options);
  if (newTitle !== undefined) {
    logger.info(`Generating task title, old: ${title}, new: ${newTitle}`);
  }
  return newTitle;
}

async function generateTaskTitleImpl({
  title,
  messages,
  getLLM,
  abortSignal,
}: GenerateTaskTitleOptions): Promise<string | undefined> {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return undefined;
  }

  let partCount = 0;
  for (const message of messages) {
    partCount += message.parts.length;
  }

  const titleFromMessages = getTitleFromMessages(messages);

  // prevent title generation when parts are too short or to long
  if (
    partCount >= 5 &&
    partCount < 20 &&
    !isTitleGeneratedByLlm(title, titleFromMessages)
  ) {
    try {
      const llm = getLLM();
      const title = await generateTitle(llm, messages, abortSignal);
      if (title.length > 0) {
        return title;
      }
    } catch (err) {
      logger.warn("Failed to generate title", err);
    }
  }

  if (title === null) {
    return titleFromMessages;
  }

  return undefined;
}

function getTitleFromMessages(messages: Message[]) {
  const firstMessage = messages.at(0);
  if (!firstMessage) return;
  const lastTextPart = firstMessage.parts.findLast((x) => x.type === "text");
  if (lastTextPart) {
    return lastTextPart.text.split("\n")[0].trim();
  }
}

function isTitleGeneratedByLlm(
  title: string | null,
  titleFromMessages: string | undefined,
) {
  return title !== titleFromMessages;
}

async function generateTitle(
  llm: RequestData["llm"],
  inputMessages: Message[],
  abortSignal: AbortSignal | undefined,
) {
  const messages: Message[] = formatters.llm([
    ...inputMessages,
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: prompts.generateTitle(),
        },
      ],
    },
  ]);

  const stream = await requestLLM(undefined, llm, {
    messages,
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

  return text.trim();
}
