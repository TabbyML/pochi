import { getLogger } from "@/lib/logger";
import { assertBackgroundJobReadInterval } from "@getpochi/common";
import {
  MaxTerminalHistoryLines,
  MaxTerminalOutputSize,
} from "@getpochi/common/tool-utils";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import {
  calculateContentBytes,
  joinContent,
  truncateTextByLimit,
} from "./output-utils";
import type { ExecutionError } from "./utils";

const logger = getLogger("TerminalHistory");

/**
 * Reconstructs the scrollback "history" of a user-opened terminal: cwd +
 * command + output for every command run in it, since VS Code's stable
 * extension API has no way to read a terminal's actual rendered screen
 * buffer (that requires the proposed, non-shippable `onDidWriteTerminalData`
 * API).
 *
 * This is intentionally a separate manager from `OutputManager`:
 * `OutputManager` captures a single command execution (used for Pochi-started
 * background jobs, where each job only ever cares about its own
 * stdout/stderr). A `TerminalHistoryManager` instance instead lives for the
 * lifetime of a terminal and accumulates every command run in it — bounded
 * by `MaxTerminalHistoryLines` (oldest lines evicted first) in addition to
 * the usual `MaxTerminalOutputSize` byte cap.
 *
 * Reads are incremental (only new content since the last read), the same
 * "only what's new" contract as `OutputManager.readOutput`.
 */
export class TerminalHistoryManager {
  private static readonly managers = new Map<string, TerminalHistoryManager>();

  private readonly output = signal<ExecuteCommandResult>({
    content: "",
    status: "idle",
    isTruncated: false,
  });

  /**
   * History chunks: command headers (cwd + command line) and output,
   * interleaved in the order they occurred.
   */
  private chunks: string[] = [];
  private isTruncated = false;
  private lastReadLength = 0; // tracks byte length, not character length
  private lastReadAt = 0;

  private constructor(public readonly id: string) {}

  static getOrCreate(id: string): TerminalHistoryManager {
    let manager = TerminalHistoryManager.managers.get(id);
    if (!manager) {
      manager = new TerminalHistoryManager(id);
      TerminalHistoryManager.managers.set(id, manager);
    }
    return manager;
  }

  static get(id: string): TerminalHistoryManager | undefined {
    return TerminalHistoryManager.managers.get(id);
  }

  static delete(id: string): void {
    TerminalHistoryManager.managers.delete(id);
  }

  /**
   * Records the start of a new command by appending a reconstructed prompt
   * line (cwd + command) to the history, ahead of the command's own output
   * (added separately via {@link addChunk}).
   */
  beginCommand(command: string, cwd?: string): void {
    const header = cwd ? `${cwd}$ ${command}\n` : `$ ${command}\n`;
    this.addChunk(header);
  }

  /**
   * Appends a chunk of output (or a command header) to the history.
   */
  addChunk(chunk: string): void {
    this.chunks.push(chunk);
    this.updateOutput("running");
  }

  /**
   * Marks the current command as finished. Unlike `OutputManager.finalize`,
   * the manager stays alive and ready to accumulate the next command run in
   * this terminal.
   */
  finalize(error?: ExecutionError): void {
    this.updateOutput("completed", error);
  }

  /**
   * Reads new history content since the last read.
   * @param regex - An optional regex to filter the output lines.
   */
  readOutput(regex?: RegExp): {
    output: string;
    isTruncated: boolean;
    status: ExecuteCommandResult["status"];
    error?: string;
  } {
    const currentOutput = this.output.value.content;
    const currentOutputBytes = Buffer.byteLength(currentOutput, "utf8");
    const now = Date.now();
    const previousReadAt = this.lastReadAt === 0 ? undefined : this.lastReadAt;
    assertBackgroundJobReadInterval({
      now,
      previousReadAt,
      status: this.output.value.status,
    });

    // Get the substring based on byte position
    let newOutput = "";
    let noMoreOutput = false;
    if (this.lastReadLength < currentOutputBytes) {
      // Find the character position that corresponds to lastReadLength bytes
      const buffer = Buffer.from(currentOutput, "utf8");
      const slicedBuffer = buffer.subarray(this.lastReadLength);
      newOutput = slicedBuffer.toString("utf8");
    } else if (this.output.value.status === "completed") {
      noMoreOutput = true;
    }

    this.lastReadLength = currentOutputBytes;
    this.lastReadAt = now;

    if (regex) {
      const lines = newOutput.split(/(\r\n|\n)/);
      const filteredParts: string[] = [];

      for (let i = 0; i < lines.length; i += 2) {
        const lineContent = lines[i] || "";
        const lineSeparator = lines[i + 1] || "";

        if (regex.test(lineContent)) {
          filteredParts.push(lineContent + lineSeparator);
        }
      }

      newOutput = filteredParts.join("");
    }

    return {
      output: newOutput,
      isTruncated: this.output.value.isTruncated ?? false,
      status: this.output.value.status,
      error: noMoreOutput
        ? `No more Output to read.${this.output.value.error ?? ""}`
        : this.output.value.error,
    };
  }

  /**
   * Updates the output signal, capping history at `MaxTerminalOutputSize`
   * bytes and `MaxTerminalHistoryLines` lines (oldest content evicted
   * first), and keeps `lastReadLength` consistent with whatever got evicted.
   */
  private updateOutput(
    status: ExecuteCommandResult["status"],
    error?: ExecutionError,
  ): void {
    const { chunks: truncatedChunks, truncatedBytes } = this.truncate(
      this.chunks,
    );
    this.chunks = truncatedChunks;

    const newContent = joinContent(this.chunks);
    const newContentBytes = Buffer.byteLength(newContent, "utf8");

    if (truncatedBytes > 0) {
      this.lastReadLength = Math.max(0, this.lastReadLength - truncatedBytes);
      this.lastReadLength = Math.min(this.lastReadLength, newContentBytes);
    }

    this.output.value = {
      content: newContent,
      status,
      isTruncated: this.isTruncated,
      error: error?.message,
    };
  }

  private truncate(chunks: string[]): {
    chunks: string[];
    truncatedBytes: number;
  } {
    let currentChunks = [...chunks];
    const initialContentBytes = calculateContentBytes(currentChunks);
    let contentBytes = initialContentBytes;
    let didTruncate = false;

    if (contentBytes > MaxTerminalOutputSize) {
      didTruncate = true;
      while (contentBytes > MaxTerminalOutputSize && currentChunks.length > 1) {
        const removedChunk = currentChunks.shift();
        if (!removedChunk) break;
        contentBytes -= Buffer.byteLength(removedChunk, "utf8");
      }
      if (contentBytes > MaxTerminalOutputSize && currentChunks.length === 1) {
        currentChunks[0] = truncateTextByLimit(
          currentChunks[0],
          MaxTerminalOutputSize,
        );
        contentBytes = calculateContentBytes(currentChunks);
      }
    }

    const { chunks: lineLimitedChunks, removedBytes } = truncateToMaxLines(
      currentChunks,
      MaxTerminalHistoryLines,
    );
    if (removedBytes > 0) {
      didTruncate = true;
      currentChunks = lineLimitedChunks;
      contentBytes -= removedBytes;
    }

    if (didTruncate && !this.isTruncated) {
      this.isTruncated = true;
      logger.warn(
        `Terminal history truncated at ${MaxTerminalOutputSize} bytes / ${MaxTerminalHistoryLines} lines`,
      );
    }

    return {
      chunks: currentChunks,
      truncatedBytes: initialContentBytes - contentBytes,
    };
  }
}

/**
 * Splits text into an array of lines, each retaining its trailing line
 * separator (\r\n or \n) if present, so re-joining the result reproduces the
 * original text exactly.
 */
function splitIntoLines(text: string): string[] {
  if (text === "") return [];

  const parts = text.split(/(\r\n|\n)/);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i] ?? "";
    const separator = parts[i + 1] ?? "";
    if (content === "" && separator === "") continue;
    lines.push(content + separator);
  }
  return lines;
}

/**
 * Keeps at most `maxLines` of the most recent lines across `chunks`,
 * collapsing them into a single chunk. Returns the number of bytes removed
 * so callers can keep read-position bookkeeping consistent.
 */
function truncateToMaxLines(
  chunks: string[],
  maxLines: number,
): { chunks: string[]; removedBytes: number } {
  const joined = joinContent(chunks);
  const lines = splitIntoLines(joined);
  if (lines.length <= maxLines) {
    return { chunks, removedBytes: 0 };
  }

  const kept = lines.slice(lines.length - maxLines).join("");
  const removedBytes =
    Buffer.byteLength(joined, "utf8") - Buffer.byteLength(kept, "utf8");
  return { chunks: [kept], removedBytes };
}
