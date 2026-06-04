import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  type PochiProviderOptions,
  type PochiRequestUseCase,
  formatters,
  getLogger,
  prompts,
} from "@getpochi/common";
import type { RecentFileState } from "@getpochi/common/tool-utils";
import { convertToModelMessages, generateText } from "ai";
import type { BlobStore } from "../../blob-store";
import { makeStoreFileQuery } from "../../livestore/default-queries";
import { makeDownloadFunction } from "../../store-blob";
import type { LiveKitStore, Message } from "../../types";

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
  taskMemoryBoundaryMessageId,
  abortSignal,
  inline,
  store,
  useCase = "compact-task",
}: {
  blobStore: BlobStore;
  taskId: string;
  model: LanguageModelV3;
  messages: Message[];
  recentFiles?: RecentFileState[];
  /** UUID of the last message covered by memory.md; messages after it are kept verbatim. */
  taskMemoryBoundaryMessageId?: string;
  abortSignal?: AbortSignal;
  inline?: boolean;
  store?: LiveKitStore;
  useCase?: Extract<PochiRequestUseCase, "compact-task" | "auto-compact-task">;
}): Promise<string | undefined> {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    throw new Error("No messages to compact");
  }

  try {
    // Prefer task memory if available
    let summaryText: string | undefined;
    let usedTaskMemory = false;
    if (store) {
      const memoryFile = store.query(makeStoreFileQuery("/memory.md"));
      if (memoryFile?.content?.trim()) {
        summaryText = memoryFile.content;
        usedTaskMemory = true;
      }
    }

    // Fall back to LLM-generated summary
    if (!summaryText) {
      summaryText = await createSummary(
        blobStore,
        taskId,
        model,
        abortSignal,
        messages.slice(0, -1),
        useCase,
      );
    }

    const recentFileContext = formatRecentFileContext(recentFiles);

    if (inline) {
      // Preferred: attach at the boundary so trailing messages survive verbatim.
      const attachIndex = usedTaskMemory
        ? findVerbatimAttachIndex(messages, taskMemoryBoundaryMessageId)
        : undefined;
      const attachMessage =
        attachIndex !== undefined ? messages[attachIndex] : undefined;
      if (attachIndex !== undefined && attachMessage) {
        const text = prompts.inlineCompact(
          summaryText,
          attachIndex,
          recentFileContext,
          { verbatimTail: true },
        );
        attachMessage.parts.unshift({ type: "text", text });
        logger.debug(
          `Inline compact attached at index ${attachIndex}; preserving ${
            messages.length - attachIndex
          } trailing messages verbatim.`,
        );
        return;
      }

      // Fallback: attach at the trailing message; tail is dropped.
      const text = prompts.inlineCompact(
        summaryText,
        messages.length - 1,
        recentFileContext,
      );
      lastMessage.parts.unshift({ type: "text", text });
      return;
    }

    // Non-inline: return the summary for callers seeding a fresh task.
    return prompts.inlineCompact(
      summaryText,
      messages.length - 1,
      recentFileContext,
    );
  } catch (err) {
    logger.warn("Failed to create summary", err);
    throw err;
  }
}

/**
 * Find the index at which to attach the compact block so trailing messages
 * survive verbatim. Returns `undefined` when the boundary is missing,
 * shadowed by a previous `<compact>` tag, or when the only reachable
 * user-role message would be index 0 (which would keep the whole
 * conversation verbatim and free no context).
 */
export function findVerbatimAttachIndex(
  messages: Message[],
  boundaryMessageId: string | undefined,
): number | undefined {
  if (!boundaryMessageId) return;

  const boundary = messages.findIndex((m) => m?.id === boundaryMessageId);
  if (boundary <= 0 || boundary >= messages.length - 1) return;

  // Bail when an existing `<compact>` tag at or after the boundary would
  // shadow the new one (the formatter honours the highest-index tag).
  const previousCompactIndex = messages.findLastIndex((m) =>
    m?.parts.some((p) => p.type === "text" && prompts.isCompact(p.text)),
  );
  if (previousCompactIndex >= boundary) return;

  // Highest user-role index in `(floor, boundary]`. The floor ensures at
  // least one curated message remains before the attach point.
  const floor = Math.max(previousCompactIndex, 0);
  const attachIndex = messages.findLastIndex(
    (m, i) => i > floor && i <= boundary && m?.role === "user",
  );
  return attachIndex === -1 ? undefined : attachIndex;
}

async function createSummary(
  blobStore: BlobStore,
  taskId: string,
  model: LanguageModelV3,
  abortSignal: AbortSignal | undefined,
  inputMessages: Message[],
  useCase: Extract<PochiRequestUseCase, "compact-task" | "auto-compact-task">,
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
        client: globalThis.POCHI_CLIENT,
        useCase,
      } satisfies PochiProviderOptions,
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
