import type { Message } from "@getpochi/livekit";

/**
 * The autocompletion candidate list is capped at 2500 entries downstream
 * (see `createFuzzySearcher`), so there is no point collecting more than that.
 */
const MaxTokens = 2500;

/**
 * Upper bound on how much message text is scanned per computation. Tool outputs
 * can be megabytes large; without a budget a single long conversation would
 * dominate both CPU and memory every time a chunk streams in.
 */
const MaxScannedChars = 256 * 1024;

const MinTokenLength = 3;

/**
 * Collect word-like tokens from the conversation to seed the prompt editor's
 * autocompletion.
 *
 * This replaces the previous `JSON.stringify(messages, null, 2)`, which
 * retained a serialized copy of the whole conversation (often tens of MB) in
 * component state and rebuilt it on every streaming update. Only the deduped
 * tokens are actually consumed, so we build them directly and keep the result
 * bounded.
 *
 * Messages are visited newest-first so that the most recent context wins when
 * the token budget is exhausted.
 */
export function collectAutoCompleteTokens(messages: Message[]): string {
  const tokens = new Set<string>();
  const tokenPattern = new RegExp(`[\\w_]{${MinTokenLength},}`, "g");
  let scannedChars = 0;

  const visitString = (value: string): boolean => {
    scannedChars += value.length;
    tokenPattern.lastIndex = 0;
    let match = tokenPattern.exec(value);
    while (match !== null) {
      tokens.add(match[0]);
      if (tokens.size >= MaxTokens) return false;
      match = tokenPattern.exec(value);
    }
    return scannedChars < MaxScannedChars;
  };

  const visit = (value: unknown): boolean => {
    if (typeof value === "string") {
      return visitString(value);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!visit(item)) return false;
      }
      return true;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) {
        if (!visit(item)) return false;
      }
    }
    return true;
  };

  for (let i = messages.length - 1; i >= 0; i--) {
    if (!visit(messages[i])) break;
  }

  return [...tokens].join(" ");
}
