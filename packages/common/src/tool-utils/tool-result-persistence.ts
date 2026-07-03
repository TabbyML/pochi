import fs from "node:fs/promises";
import path from "node:path";
import { getLogger } from "../base";
import {
  MaxPersistedToolResultSize,
  PersistedToolResultPreviewSize,
} from "./limits";
import { getTaskDataDir } from "./pochi-paths";

const logger = getLogger("tool-result-persistence");

const EXEMPT_TOOLS = ["readFile"];

function getToolResultsDir(taskId: string): string {
  return path.join(getTaskDataDir(taskId), "tool-results");
}

function generatePreview(
  content: string,
  maxSize: number,
): { preview: string; hasMore: boolean } {
  if (content.length <= maxSize) {
    return { preview: content, hasMore: false };
  }
  const halfSize = Math.floor(maxSize / 2);

  // Get first part up to halfSize, aligned to the last newline
  let firstPart = content.slice(0, halfSize);
  const lastNewlineFirst = firstPart.lastIndexOf("\n");
  if (lastNewlineFirst > halfSize * 0.5) {
    firstPart = firstPart.slice(0, lastNewlineFirst);
  }

  // Get last part from content.length - halfSize to end, aligned to the first newline
  let lastPart = content.slice(-halfSize);
  const firstNewlineLast = lastPart.indexOf("\n");
  if (firstNewlineLast !== -1 && firstNewlineLast < halfSize * 0.5) {
    lastPart = lastPart.slice(firstNewlineLast + 1);
  }

  const preview = `${firstPart}\n\n... [truncated ${content.length - firstPart.length - lastPart.length} chars] ...\n\n${lastPart}`;
  return { preview, hasMore: true };
}

function buildTruncatedValue(fieldValue: string, filePath: string): string {
  const { preview } = generatePreview(
    fieldValue,
    PersistedToolResultPreviewSize,
  );
  let message = `[Output too large: ${fieldValue.length} chars. Full content saved to: ${filePath}\n`;
  message += "Use readFile to access the full content if needed.\n\n";
  message += `Preview (first and last ~${Math.floor(PersistedToolResultPreviewSize / 2)} chars):\n`;
  message += preview;
  message += "]";
  return message;
}

export async function maybePersistToolResult(
  toolName: string,
  toolCallId: string,
  taskId: string,
  output: unknown,
): Promise<unknown> {
  if (EXEMPT_TOOLS.includes(toolName)) return output;
  if (typeof output !== "object" || output === null) return output;

  try {
    const serialized = JSON.stringify(output);
    if (serialized.length <= MaxPersistedToolResultSize) return output;

    const result: Record<string, unknown> = {
      ...(output as Record<string, unknown>),
    };

    const dir = getToolResultsDir(taskId);
    let persisted = false;

    // Case 1: top-level string fields (execute-command, read-background-job)
    for (const [key, value] of Object.entries(result)) {
      if (typeof value !== "string") continue;
      if (value.length <= PersistedToolResultPreviewSize) continue;

      const filePath = path.join(dir, `${toolName}-${toolCallId}-${key}.log`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, value, "utf-8");

      result[key] = buildTruncatedValue(value, filePath);
      persisted = true;

      logger.debug(
        `Persisted field "${key}" for ${toolName}(${toolCallId}): ${value.length} chars -> ${filePath}`,
      );
    }

    // Case 2: MCP-style content array { content: Array<{type, text}> }
    // Skip if any block is non-text (e.g. images); otherwise replace entire
    // array with a single preview text block.
    if (!persisted && Array.isArray(result.content)) {
      const contentArray = result.content as unknown[];
      const hasNonText = contentArray.some(
        (item) =>
          typeof item !== "object" ||
          item === null ||
          (item as Record<string, unknown>).type !== "text",
      );
      if (!hasNonText) {
        const combined = (contentArray as { type: "text"; text: string }[])
          .map((b) => b.text)
          .join("\n");

        const filePath = path.join(
          dir,
          `${toolName}-${toolCallId}-content.log`,
        );
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, combined, "utf-8");

        result.content = [
          { type: "text", text: buildTruncatedValue(combined, filePath) },
        ];
        persisted = true;

        logger.debug(
          `Persisted MCP content for ${toolName}(${toolCallId}): ${combined.length} chars -> ${filePath}`,
        );
      }
    }

    return persisted ? result : output;
  } catch (error) {
    logger.warn(`Failed to persist tool result for ${toolName}: ${error}`);
    return output;
  }
}
