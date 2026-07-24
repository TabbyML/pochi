import { getLogger } from "@/lib/logger";
import { assertBackgroundJobReadInterval } from "@getpochi/common";
import { MaxTerminalOutputSize } from "@getpochi/common/tool-utils";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import {
  calculateContentBytes,
  joinContent,
  truncateTextByLimit,
} from "./output-utils";
import type { ExecutionError } from "./utils";

const logger = getLogger("TerminalOutput");

/**
 * Result of content truncation operation
 */
interface TruncationResult {
  chunks: string[];
  isTruncated: boolean;
  truncatedBytes: number;
}

/**
 * Handles content truncation logic for shell output
 */
export class OutputTruncator {
  private isTruncated = false;

  /**
   * Truncates chunks to stay within the maximum content size limit
   */
  truncateChunks(chunks: string[]): TruncationResult {
    const currentChunks = [...chunks];
    const initialContentBytes = calculateContentBytes(currentChunks);
    let contentBytes = initialContentBytes;

    if (contentBytes <= MaxTerminalOutputSize) {
      return {
        chunks: currentChunks,
        isTruncated: this.isTruncated,
        truncatedBytes: 0,
      };
    }

    // Remove chunks from the beginning until we're under the limit
    while (contentBytes > MaxTerminalOutputSize && currentChunks.length > 1) {
      const removedChunk = currentChunks.shift(); // Remove the first (oldest) chunk
      if (!removedChunk) break; // Safety check, though this shouldn't happen

      // Subtract the removed chunk's bytes
      const removedChunkBytes = Buffer.byteLength(removedChunk, "utf8");
      contentBytes -= removedChunkBytes;
    }

    // If only one chunk left but still exceeds limit, truncate its content
    if (contentBytes > MaxTerminalOutputSize && currentChunks.length === 1) {
      const originalChunk = currentChunks[0];
      currentChunks[0] = truncateTextByLimit(
        originalChunk,
        MaxTerminalOutputSize,
      );
      contentBytes = calculateContentBytes(currentChunks);
    }

    if (!this.isTruncated) {
      this.isTruncated = true;
      logger.warn(`Shell output truncated at ${MaxTerminalOutputSize} bytes`);
    }

    const truncatedBytes = initialContentBytes - contentBytes;
    return { chunks: currentChunks, isTruncated: true, truncatedBytes };
  }
}

interface OutputManagerOptions {
  /**
   * terminalJob id
   */
  id: string;
  /**
   * for UI display
   */
  command: string;
}

export class OutputManager {
  private static readonly managers = new Map<string, OutputManager>();

  public readonly output = signal<ExecuteCommandResult>({
    content: "",
    status: "idle",
    isTruncated: false,
  });

  public id: string;

  public command: string;

  /**
   * output text chunks, a chunk may contain multiple lines
   */
  private chunks: string[] = [];
  private truncator = new OutputTruncator();
  private lastReadLength = 0; // tracks byte length, not character length
  private lastReadAt = 0;

  private constructor(options: OutputManagerOptions) {
    this.id = options.id;
    this.command = options.command;
  }

  static create(options: OutputManagerOptions): OutputManager {
    const manager = new OutputManager(options);
    OutputManager.managers.set(options.id, manager);
    return manager;
  }

  static get(id: string): OutputManager | undefined {
    return OutputManager.managers.get(id);
  }

  static delete(id: string): void {
    OutputManager.managers.delete(id);
  }

  /**
   * Reads new output from the job since the last read.
   * @param regex - An optional regex to filter the output.
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
      /**
       * The splitting with a capturing group creates an array where:
       * Even indices (0, 2, 4, ...) contain the actual line content
       * Odd indices (1, 3, 5, ...) contain the line separators (\r\n or \n)
       */
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
   * Adds a new line to the output and updates the signal
   */
  addChunk(chunk: string): void {
    this.chunks.push(chunk);
    this.updateOutput("running");
  }

  /**
   * Finalizes the output with completion status and optional error
   */
  finalize(error?: ExecutionError): void {
    if (this.output.value.status === "completed") {
      // Ignore finalization if already completed
      return;
    }
    // Final truncation check
    const {
      chunks: finalChunks,
      isTruncated,
      truncatedBytes,
    } = this.truncator.truncateChunks(this.chunks);
    this.chunks = finalChunks;

    const finalContent = joinContent(this.chunks);
    const finalContentBytes = Buffer.byteLength(finalContent, "utf8");

    this.adjustLastReadLength(truncatedBytes, finalContentBytes);

    this.output.value = {
      content: finalContent,
      status: "completed",
      isTruncated,
      error: error?.message,
    };
  }

  /**
   * Adjusts lastReadLength based on truncation to maintain correct read position
   */
  private adjustLastReadLength(
    truncatedBytes: number,
    contentBytes: number,
  ): void {
    if (truncatedBytes > 0) {
      // Adjust lastReadLength based on how much content was truncated
      this.lastReadLength = Math.max(0, this.lastReadLength - truncatedBytes);
      // Ensure lastReadLength doesn't exceed the new content size
      this.lastReadLength = Math.min(this.lastReadLength, contentBytes);
    }
  }

  /**
   * Updates the output signal with current content and status
   */
  private updateOutput(status: ExecuteCommandResult["status"]): void {
    const {
      chunks: truncatedChunks,
      isTruncated,
      truncatedBytes,
    } = this.truncator.truncateChunks(this.chunks);
    this.chunks = truncatedChunks;

    const newContent = joinContent(this.chunks);
    const newContentBytes = Buffer.byteLength(newContent, "utf8");

    this.adjustLastReadLength(truncatedBytes, newContentBytes);

    this.output.value = {
      content: newContent,
      status,
      isTruncated,
    };
  }
}
