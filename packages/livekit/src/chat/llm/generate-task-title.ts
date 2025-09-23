import type { LanguageModelV2 } from "@ai-sdk/provider";
import { formatters, getLogger, prompts } from "@getpochi/common";
import { convertToModelMessages, streamText } from "ai";
import type { Message } from "../../types";

const logger = getLogger("generateTaskTitle");

interface GenerateTaskTitleOptions {
  title: string | null;
  messages: Message[];
  getModel: () => LanguageModelV2;
  abortSignal?: AbortSignal;
}

export async function generateTaskTitle(options: GenerateTaskTitleOptions) {
  const { title } = options;
  const newTitle = await generateTaskTitleImpl(options);
  if (newTitle !== undefined) {
    logger.debug(`Generating task title, old: ${title}, new: ${newTitle}`);
  }
  return newTitle;
}

async function generateTaskTitleImpl({
  title,
  messages,
  getModel,
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
      const model = getModel();
      const title = await generateTitle(model, messages, abortSignal);
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
          text: prompts.generateTitle(),
        },
      ],
    },
  ];

  const stream = streamText({
    model,
    prompt: convertToModelMessages(
      formatters.llm(messages, { removeSystemReminder: true }),
    ),
    abortSignal,
    maxOutputTokens: 50,
    maxRetries: 0,
  });

  return (await stream.text).trim();
}
