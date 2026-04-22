import type { LanguageModelV3 } from "@ai-sdk/provider";
import { formatters, getLogger, prompts } from "@getpochi/common";
import type { RecentFileState } from "@getpochi/common/tool-utils";
import { convertToModelMessages, generateText } from "ai";
import type { BlobStore } from "../../blob-store";
import { makeDownloadFunction } from "../../store-blob";
import type { Message } from "../../types";

const logger = getLogger("compactTask");
const PostCompactMaxFilesToRestore = 5;
const PostCompactMaxCharsPerFile = 20_000;
const PostCompactTotalCharBudget = 80_000;

export async function compactTask({
  blobStore,
  taskId,
  model,
  messages,
  recentFiles,
  abortSignal,
  inline,
}: {
  blobStore: BlobStore;
  taskId: string;
  model: LanguageModelV3;
  messages: Message[];
  recentFiles?: RecentFileState[];
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
        blobStore,
        taskId,
        model,
        abortSignal,
        messages.slice(0, -1),
      ),
      messages.length - 1,
      formatRecentFileContext(recentFiles),
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
  blobStore: BlobStore,
  taskId: string,
  model: LanguageModelV3,
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
    providerOptions: {
      pochi: {
        taskId,
        version: globalThis.POCHI_CLIENT,
        useCase: "compact-task",
      },
    },
    model,
    prompt: await convertToModelMessages(
      formatters.llm(messages, {
        removeSystemReminder: true,
      }),
    ),
    experimental_download: makeDownloadFunction(blobStore),
    abortSignal,
    maxOutputTokens: 3_000,
    maxRetries: 0,
  });

  return resp.text;
}

function formatRecentFileContext(
  recentFiles: RecentFileState[] | undefined,
): string | undefined {
  const files = recentFiles?.slice(0, PostCompactMaxFilesToRestore) ?? [];
  if (files.length === 0) {
    return;
  }

  const parts: string[] = ["Recent files preserved after compaction:"];
  let usedChars = 0;

  for (const file of files) {
    const content = file.content;
    const remainingBudget = PostCompactTotalCharBudget - usedChars;
    if (remainingBudget <= 0) {
      break;
    }

    if (
      file.isTruncated ||
      content.length > PostCompactMaxCharsPerFile ||
      content.length > remainingBudget
    ) {
      const reference = `File reference: ${file.path}${formatLineRange(file)} (content omitted because the file is too large or the read result was truncated)`;
      usedChars += reference.length;
      parts.push(reference);
      continue;
    }

    usedChars += content.length;
    parts.push(
      [
        `File: ${file.path}${formatLineRange(file)}`,
        "```",
        content,
        "```",
      ].join("\n"),
    );
  }

  return parts.length > 1 ? parts.join("\n\n") : undefined;
}

function formatLineRange(file: RecentFileState): string {
  if (file.startLine === undefined && file.endLine === undefined) {
    return "";
  }
  if (file.startLine === undefined) {
    return ` (through line ${file.endLine})`;
  }
  if (file.endLine === undefined) {
    return ` (from line ${file.startLine})`;
  }
  return ` (lines ${file.startLine}-${file.endLine})`;
}
