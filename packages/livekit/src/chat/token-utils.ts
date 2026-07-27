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
 * These are starting points only; `updateModelCalibration` nudges the
 * effective ratio toward whatever each model's tokenizer actually
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
 * Per-model calibration factor, blended equally into both char buckets.
 * Updated via an exponential moving average (see `updateModelCalibration`)
 * whenever we learn a request's real *input* token usage from the provider,
 * so the heuristic estimate gradually tracks that model's actual tokenizer.
 *
 * Keyed by model (see `getModelCalibrationKey`) rather than a single process-
 * wide value: different models/providers have meaningfully different
 * chars-per-token ratios, and tasks can run concurrently against different
 * models (main task + forked sub-agents), so sharing one factor would let
 * them contaminate each other's calibration. This is intentionally in-memory
 * only: it resets on restart rather than persisting across sessions.
 */
const TokenCalibrationEmaAlpha = 0.3;
const MinTokenCalibrationFactor = 0.3;
const MaxTokenCalibrationFactor = 3;

const calibrationFactorByModel = new Map<string, number>();

/** Stable identifier used to key per-model calibration state. */
export function getModelCalibrationKey(
  llm: { id: string } | undefined,
): string {
  return llm?.id ?? "default";
}

/** @internal exported for testing */
export function getModelCalibrationFactor(modelKey: string): number {
  return calibrationFactorByModel.get(modelKey) ?? 1;
}

/** @internal exported for testing */
export function resetTokenCalibration(modelKey?: string): void {
  if (modelKey) {
    calibrationFactorByModel.delete(modelKey);
  } else {
    calibrationFactorByModel.clear();
  }
}

/**
 * Nudges `modelKey`'s calibration factor toward
 * `actualTokens / rawEstimatedTokens` using an EMA, so future `estimateTokens`
 * calls for that model gradually track its real tokenizer's behavior.
 *
 * Both arguments must refer to the *uncalibrated* (raw, factor=1) heuristic
 * estimate of exactly the content the provider counted for `actualTokens`.
 * In practice this means comparing against `inputTokens` (the request's
 * prompt token count) rather than `totalTokens`: output/completion usage can
 * include invisible reasoning tokens for content we never see and therefore
 * can't estimate, and attributing that gap to the chars-per-token ratio
 * would bias the factor upward for reasons unrelated to tokenization,
 * eventually triggering context compaction too early. Ignored when either
 * input is non-positive.
 */
export function updateModelCalibration(
  modelKey: string,
  actualTokens: number,
  rawEstimatedTokens: number,
): void {
  if (actualTokens <= 0 || rawEstimatedTokens <= 0) return;
  const current = getModelCalibrationFactor(modelKey);
  const ratio = actualTokens / rawEstimatedTokens;
  const next =
    current * (1 - TokenCalibrationEmaAlpha) + ratio * TokenCalibrationEmaAlpha;
  calibrationFactorByModel.set(
    modelKey,
    Math.min(
      Math.max(next, MinTokenCalibrationFactor),
      MaxTokenCalibrationFactor,
    ),
  );
}

/**
 * `calibrationFactor` should be a value snapshotted once per request (e.g.
 * via `getModelCalibrationFactor` at the start of `sendMessages`) rather than
 * re-read for every call, so that all estimates computed over the course of
 * a single request stay internally consistent even if another concurrent
 * request updates the shared per-model state in the meantime.
 */
export function estimateTokens(text: string, calibrationFactor = 1): number {
  const { otherChars, cjkChars } = countCharBuckets(text);
  const raw =
    otherChars / DefaultOtherCharsPerToken + cjkChars / DefaultCjkCharsPerToken;
  return Math.ceil(raw * calibrationFactor);
}

/**
 * Estimates the total number of tokens across all message parts.
 * Used as a fallback when the provider does not return a usage total.
 */
export function estimateTotalTokens(
  messages: Message[],
  calibrationFactor = 1,
): number {
  let totalTokens = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        totalTokens += estimateTokens(part.text, calibrationFactor);
      } else if (part.type === "reasoning") {
        totalTokens += estimateTokens(part.text, calibrationFactor);
      } else if (part.type === "file") {
        totalTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        totalTokens += estimateTokens(JSON.stringify(part), calibrationFactor);
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
export function estimateTokenBreakdown(
  messages: Message[],
  calibrationFactor = 1,
): TokenBreakdown {
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
              const tokens = estimateTokens(reminder, calibrationFactor);
              if (prompts.isAutoMemorySystemReminder(reminder)) {
                projectMemoryTokens += tokens;
              } else {
                systemReminderTokens += tokens;
              }
            }
            contentStr = contentStr.replace(reminderRegex, "");
          }
        }
        messagesTokens += estimateTokens(contentStr, calibrationFactor);
      } else if (part.type === "file") {
        filesTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        messagesTokens += estimateTokens(
          JSON.stringify(part.input || {}),
          calibrationFactor,
        );
        if (part.state === "output-available" && part.output) {
          const output = (part as unknown as { output: unknown }).output;
          let outputTokens = 0;

          if (output instanceof Uint8Array) {
            outputTokens = ImageEstimatedTokens;
          } else {
            const resultStr =
              typeof output === "string" ? output : JSON.stringify(output);
            outputTokens = estimateTokens(resultStr, calibrationFactor);
          }

          const toolName = part.type.replace(/^tool-/, "");
          if (["readFile", "searchFiles", "globFiles"].includes(toolName)) {
            filesTokens += outputTokens;
          } else {
            toolResultsTokens += outputTokens;
          }
        }
      } else if (part.type === "reasoning") {
        messagesTokens += estimateTokens(part.text, calibrationFactor);
      } else {
        messagesTokens += estimateTokens(
          JSON.stringify(part),
          calibrationFactor,
        );
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
 *
 * `request.calibrationFactor` (defaulting to 1) is applied to the messages
 * breakdown too, so it should be the same factor snapshotted when
 * `systemPromptTokens`/`toolsTokens` were computed -- keeping every bucket of
 * a single snapshot internally consistent even if the model's calibration
 * factor has since moved on (e.g. from a later, concurrent request).
 */
export function computeContextWindowUsage(
  messages: Message[],
  request:
    | {
        systemPromptTokens?: number;
        toolsTokens?: number;
        calibrationFactor?: number;
      }
    | undefined,
): ContextWindowUsage | undefined {
  const {
    messagesTokens,
    filesTokens,
    toolResultsTokens,
    systemReminderTokens,
    projectMemoryTokens,
  } = estimateTokenBreakdown(messages, request?.calibrationFactor ?? 1);

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
