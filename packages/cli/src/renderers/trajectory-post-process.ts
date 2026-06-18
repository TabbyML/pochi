import { createReadStream, createWriteStream } from "node:fs";
import { rename } from "node:fs/promises";
import * as readline from "node:readline";
import { MessagePartLine } from "./trajectory-types";

function createLineStream(filePath: string): readline.Interface {
  return readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
}

/**
 * Reads a trajectory NDJSON file and removes duplicate MessagePartLines,
 * keeping only the last occurrence of each (messageId, index) pair.
 * Non-JSON lines and lines that are not MessagePartLine are always preserved.
 * The result is written back to the same file path.
 *
 * Uses a two-pass streaming approach:
 * - Pass 1: stream lines once; record which line numbers are MessagePartLines
 *   and track the last line number per (messageId, index) key. Only integers
 *   are stored — no line content is retained.
 * - Pass 2: stream lines again; use the precomputed sets to decide keep/drop
 *   without re-parsing JSON. Non-MessagePartLine lines are written as-is.
 */
export async function deduplicateMessageParts(filePath: string): Promise<void> {
  // Pass 1: collect line-number metadata only, no raw content stored
  //   messagePartLineNumbers — every line that parsed as a MessagePartLine
  //   lastSeenAt            — last line number per (messageId, index) key
  const messagePartLineNumbers = new Set<number>();
  const lastSeenAt = new Map<string, number>();

  await new Promise<void>((resolve, reject) => {
    const rl = createLineStream(filePath);
    let lineNumber = 0;

    rl.on("line", (rawLine) => {
      const currentLine = lineNumber++;

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawLine);
      } catch {
        return;
      }

      const result = MessagePartLine.safeParse(parsed);
      if (!result.success) {
        return;
      }

      const { messageId, index } = result.data;
      messagePartLineNumbers.add(currentLine);
      lastSeenAt.set(`${messageId}:${index}`, currentLine);
    });

    rl.on("close", resolve);
    rl.on("error", reject);
  });

  // Derive the set of MessagePartLine numbers that should be kept (last occurrence per key)
  const keptMessagePartLineNumbers = new Set(lastSeenAt.values());

  // Pass 2: stream again; decide keep/drop purely from line-number sets — no JSON re-parse
  const tmpPath = `${filePath}.tmp`;

  await new Promise<void>((resolve, reject) => {
    const rl = createLineStream(filePath);
    const out = createWriteStream(tmpPath);
    let lineNumber = 0;
    let streamError: Error | null = null;

    out.on("error", (err) => {
      streamError = err;
      rl.close();
      reject(err);
    });

    rl.on("line", (rawLine) => {
      const currentLine = lineNumber++;

      if (streamError) {
        return;
      }

      if (messagePartLineNumbers.has(currentLine)) {
        // MessagePartLine: only write if this is the last occurrence of its key
        if (keptMessagePartLineNumbers.has(currentLine)) {
          out.write(`${rawLine}\n`);
        }
      } else {
        // Non-MessagePartLine: always write, no JSON parse needed
        out.write(`${rawLine}\n`);
      }
    });

    rl.on("close", () => {
      if (!streamError) {
        out.end();
      }
    });

    rl.on("error", (err) => {
      out.destroy();
      reject(err);
    });

    out.on("finish", resolve);
  });

  await rename(tmpPath, filePath);
}
