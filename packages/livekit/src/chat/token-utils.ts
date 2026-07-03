import type { ContextWindowUsage } from "@getpochi/common";
import { prompts } from "@getpochi/common";
import { isStaticToolUIPart } from "ai";
import type { Message } from "../types";

export const ImageEstimatedTokens = 1000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates the total number of tokens across all message parts.
 * Used as a fallback when the provider does not return a usage total.
 */
export function estimateTotalTokens(messages: Message[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        totalTokens += estimateTokens(part.text);
      } else if (part.type === "reasoning") {
        totalTokens += estimateTokens(part.text);
      } else if (part.type === "file") {
        totalTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        totalTokens += estimateTokens(JSON.stringify(part));
      }
    }
  }
  return totalTokens;
}

export type TokenBreakdown = {
  messagesTokens: number;
  filesTokens: number;
  toolResultsTokens: number;
  systemReminderTokens: number;
  projectMemoryTokens: number;
};

/**
 * Buckets message tokens into non-overlapping breakdown categories used by
 * `ContextWindowUsage`.
 */
export function estimateTokenBreakdown(messages: Message[]): TokenBreakdown {
  let messagesTokens = 0;
  let filesTokens = 0;
  let toolResultsTokens = 0;
  let systemReminderTokens = 0;
  let projectMemoryTokens = 0;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") {
        let contentStr = part.text;
        if (msg.role === "user" && contentStr.includes("<system-reminder>")) {
          const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
          const reminders = contentStr.match(reminderRegex);
          if (reminders) {
            for (const reminder of reminders) {
              const tokens = estimateTokens(reminder);
              if (prompts.isAutoMemorySystemReminder(reminder)) {
                projectMemoryTokens += tokens;
              } else {
                systemReminderTokens += tokens;
              }
            }
            contentStr = contentStr.replace(reminderRegex, "");
          }
        }
        messagesTokens += estimateTokens(contentStr);
      } else if (part.type === "file") {
        filesTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        messagesTokens += estimateTokens(JSON.stringify(part.input || {}));
        if (part.state === "output-available" && part.output) {
          const output = (part as unknown as { output: unknown }).output;
          let outputTokens = 0;

          if (output instanceof Uint8Array) {
            outputTokens = ImageEstimatedTokens;
          } else {
            const resultStr =
              typeof output === "string" ? output : JSON.stringify(output);
            outputTokens = estimateTokens(resultStr);
          }

          const toolName = part.type.replace(/^tool-/, "");
          if (["readFile", "searchFiles", "globFiles"].includes(toolName)) {
            filesTokens += outputTokens;
          } else {
            toolResultsTokens += outputTokens;
          }
        }
      } else if (part.type === "reasoning") {
        messagesTokens += estimateTokens(part.text);
      } else {
        messagesTokens += estimateTokens(JSON.stringify(part));
      }
    }
  }

  return {
    messagesTokens,
    filesTokens,
    toolResultsTokens,
    systemReminderTokens,
    projectMemoryTokens,
  };
}

/**
 * Builds a `ContextWindowUsage` snapshot by combining the per-message token
 * breakdown with the system-prompt and tools token counts captured at the
 * request boundary. Returns `undefined` when the total is zero so callers can
 * skip persisting an empty usage.
 */
export function computeContextWindowUsage(
  messages: Message[],
  request: { systemPromptTokens?: number; toolsTokens?: number } | undefined,
): ContextWindowUsage | undefined {
  const {
    messagesTokens,
    filesTokens,
    toolResultsTokens,
    systemReminderTokens,
    projectMemoryTokens,
  } = estimateTokenBreakdown(messages);

  const systemTokens =
    (request?.systemPromptTokens || 0) + systemReminderTokens;
  const toolsTokens = request?.toolsTokens || 0;

  const totalTokens =
    systemTokens +
    toolsTokens +
    messagesTokens +
    filesTokens +
    toolResultsTokens +
    projectMemoryTokens;

  if (totalTokens <= 0) return undefined;

  return {
    system: systemTokens,
    tools: toolsTokens,
    messages: messagesTokens,
    files: filesTokens,
    toolResults: toolResultsTokens,
    projectMemory: projectMemoryTokens,
  };
}
