import type { ContextWindowUsage } from "@getpochi/common";
import { prompts } from "@getpochi/common";
import { isStaticToolUIPart } from "ai";
import type { Message } from "../types";

export const ImageEstimatedTokens = 1000;

/**
 * Approximate chars-per-token ratios used for token estimation, tuned for
 * common BPE tokenizers (e.g. cl100k/o200k):
 * - Non-CJK text (mostly Latin-script prose/code) tokenizes at roughly 4
 *   chars/token.
 * - CJK text (Chinese/Japanese/Korean) tokenizes much closer to one token per
 *   character, since BPE vocabularies rarely merge multiple CJK ideographs
 *   into a single token, so a much smaller ratio is used.
 * These are starting points only; `updateTokenCalibration` nudges the
 * effective ratio toward whatever the active model's tokenizer actually
 * produces.
 */
export const DefaultOtherCharsPerToken = 4;
export const DefaultCjkCharsPerToken = 1.5;

// Covers CJK Unified Ideographs (+ Extension A), Hiragana/Katakana, Hangul
// syllables, and fullwidth forms/punctuation commonly seen in CJK text.
const CjkCharPattern =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7a3\uff00-\uffef]/g;

function countCharBuckets(text: string): {
  otherChars: number;
  cjkChars: number;
} {
  const cjkChars = text.match(CjkCharPattern)?.length ?? 0;
  const otherChars = text.length - cjkChars;
  return { otherChars, cjkChars };
}

/**
 * Session-local calibration factor, blended equally into both char buckets.
 * Updated via an exponential moving average (see `updateTokenCalibration`)
 * whenever we learn a request's real token usage from the provider, so the
 * heuristic estimate gradually tracks the active model's actual tokenizer.
 * This is intentionally in-memory only: it resets on restart rather than
 * persisting across sessions.
 */
const TokenCalibrationEmaAlpha = 0.3;
const MinTokenCalibrationFactor = 0.3;
const MaxTokenCalibrationFactor = 3;

let tokenCalibrationFactor = 1;

/** @internal exported for testing */
export function getTokenCalibrationFactor(): number {
  return tokenCalibrationFactor;
}

/** @internal exported for testing */
export function resetTokenCalibration(): void {
  tokenCalibrationFactor = 1;
}

/**
 * Nudges the calibration factor toward `actualTokens / estimatedTokens` using
 * an EMA, so future `estimateTokens` calls gradually track the real
 * tokenizer's behavior. Pass whatever (already-calibrated) estimate
 * `estimateTokens`/`computeContextWindowUsage` produced for the same content
 * the provider counted; this function divides the current factor back out
 * internally so the comparison is against the raw, uncalibrated heuristic
 * rather than compounding on top of the previous calibration (which would
 * otherwise make the factor converge toward the sqrt of the true ratio
 * instead of the true ratio itself). Ignored when either input is
 * non-positive.
 */
export function updateTokenCalibration(
  actualTokens: number,
  estimatedTokens: number,
): void {
  if (actualTokens <= 0 || estimatedTokens <= 0) return;
  const rawEstimatedTokens = estimatedTokens / tokenCalibrationFactor;
  const ratio = actualTokens / rawEstimatedTokens;
  const next =
    tokenCalibrationFactor * (1 - TokenCalibrationEmaAlpha) +
    ratio * TokenCalibrationEmaAlpha;
  tokenCalibrationFactor = Math.min(
    Math.max(next, MinTokenCalibrationFactor),
    MaxTokenCalibrationFactor,
  );
}

export function estimateTokens(text: string): number {
  const { otherChars, cjkChars } = countCharBuckets(text);
  const raw =
    otherChars / DefaultOtherCharsPerToken + cjkChars / DefaultCjkCharsPerToken;
  return Math.ceil(raw * tokenCalibrationFactor);
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
