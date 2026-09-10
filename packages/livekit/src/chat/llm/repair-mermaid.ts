import type { LanguageModelV3 } from "@ai-sdk/provider";
import {
  type PochiProviderOptions,
  formatters,
  getLogger,
  prompts,
} from "@getpochi/common";
import { convertToModelMessages, generateText } from "ai";
import { events } from "../../livestore/default-schema";
import type { LiveKitStore, Message } from "../../types";

const logger = getLogger("repairMermaid");

export async function repairMermaid({
  store,
  taskId,
  model,
  messages,
  chart,
  error,
  abortSignal,
}: {
  store: LiveKitStore;
  taskId: string;
  model: LanguageModelV3;
  messages: Message[];
  chart: string;
  error: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  // Find all messages containing the mermaid diagram by searching through all parts
  // This is more reliable than using messageId since messages may be transformed in UI/DB
  // Any string in a part might be rendered as markdown (message text, reasoning,
  // tool inputs such as `attemptCompletion.result` or `askFollowupQuestion.questions[].question`),
  // so the whole part is walked recursively.
  const messagesWithMermaid = messages.filter((msg) =>
    msg.parts.some((part) => containsMermaidChart(part, chart)),
  );

  if (messagesWithMermaid.length === 0) {
    throw new Error("Message containing mermaid chart not found");
  }

  logger.debug(
    "repairMermaid",
    `Found ${messagesWithMermaid.length} message(s) to repair`,
    chart,
  );

  try {
    // Generate the fixed mermaid diagram
    const fixedMermaid = await generateFixedMermaid(
      taskId,
      store.storeId,
      model,
      abortSignal,
      chart,
      error,
    );

    // Collect all updated messages
    const updatedMessages: Message[] = [];

    const mermaidPattern = buildMermaidPattern(chart);
    const fixedMermaidBlock = `\`\`\`mermaid\n${fixedMermaid}\n\`\`\``;

    // Update all messages containing the chart
    for (const messageWithMermaid of messagesWithMermaid) {
      // Find and update the part with mermaid code, creating new objects to trigger updates
      let replaced = false;

      const updatedParts = messageWithMermaid.parts.map((part) => {
        const updatedPart = replaceMermaidChart(
          part,
          mermaidPattern,
          fixedMermaidBlock,
        );
        if (updatedPart !== part) {
          replaced = true;
          logger.debug(`Replaced mermaid in ${part.type} part`);
        }
        return updatedPart;
      });

      if (!replaced) {
        logger.warn(
          "Mermaid code was not replaced - regex did not match in message",
          messageWithMermaid.id,
        );
        continue;
      }

      const updatedMessage: Message = {
        ...messageWithMermaid,
        parts: updatedParts,
      };

      updatedMessages.push(updatedMessage);
    }

    // Commit all updated messages to the database in a single transaction
    if (updatedMessages.length > 0) {
      store.commit(
        events.mermaidRepaired({
          repairs: updatedMessages.map(({ id, parts }) => ({ id, parts })),
        }),
      );
      logger.debug(
        `Committed ${updatedMessages.length} updated message(s) to database`,
      );
    }
  } catch (err) {
    logger.warn("Failed to repair mermaid", err);
    throw err;
  }
}

/**
 * Builds a regex matching the exact mermaid code block holding `chart`.
 */
function buildMermaidPattern(chart: string) {
  // Escape special regex characters in the chart content
  const escapedChart = chart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\`\`\`mermaid\\s*\\n${escapedChart}\\s*\\n\`\`\``, "gs");
}

/**
 * Only plain objects are walked, so exotic values (Date, Map, ...) are kept as-is.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks whether `value` holds - at any depth - a string containing the mermaid chart.
 *
 * Charts may live in plain text / reasoning parts, but also in tool call inputs
 * (e.g. `attemptCompletion.result` or `askFollowupQuestion.questions[].question`),
 * which are rendered as markdown as well.
 */
function containsMermaidChart(value: unknown, chart: string): boolean {
  if (typeof value === "string") {
    return value.includes("```mermaid") && value.includes(chart);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMermaidChart(item, chart));
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((item) =>
      containsMermaidChart(item, chart),
    );
  }

  return false;
}

/**
 * Recursively replaces every mermaid block matching `pattern` with `replacement`.
 *
 * Returns the original reference when nothing changed, so callers can detect
 * updates with a simple identity check and avoid pointless re-renders.
 */
function replaceMermaidChart<T>(
  value: T,
  pattern: RegExp,
  replacement: string,
): T {
  if (typeof value === "string") {
    // Use a replacer function so that `$` sequences in the fixed chart are kept as-is
    const replaced = value.replace(pattern, () => replacement);
    return (replaced === value ? value : replaced) as T;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const updated = replaceMermaidChart(item, pattern, replacement);
      if (updated !== item) changed = true;
      return updated;
    });
    return (changed ? items : value) as T;
  }

  if (isPlainObject(value)) {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const updated = replaceMermaidChart(item, pattern, replacement);
      if (updated !== item) changed = true;
      return [key, updated] as const;
    });
    return (changed ? Object.fromEntries(entries) : value) as T;
  }

  return value;
}

async function generateFixedMermaid(
  taskId: string,
  storeId: string,
  model: LanguageModelV3,
  abortSignal: AbortSignal | undefined,
  chart: string,
  error: string,
) {
  const messages: Message[] = [
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: prompts.fixMermaidError(chart, error),
        },
      ],
    },
  ];

  const resp = await generateText({
    providerOptions: {
      pochi: {
        taskId,
        storeId,
        client: globalThis.POCHI_CLIENT,
        useCase: "repair-mermaid",
      } satisfies PochiProviderOptions,
    },
    model,
    prompt: await convertToModelMessages(
      formatters.llm(messages, {
        removeSystemReminder: true,
      }),
    ),
    abortSignal,
    maxOutputTokens: 2000,
    maxRetries: 0,
  });

  // Extract mermaid code from response
  // Match ```mermaid with optional whitespace, then capture everything until closing ```
  const match = resp.text.match(/```mermaid\s*\n([\s\S]*?)```/);
  if (match?.[1]) {
    logger.debug("Extracted mermaid from code block");
    return match[1].trim();
  }

  // If still no match, assume the entire response is the mermaid code
  logger.warn(
    "No mermaid code block found in response, using entire text. Response preview:",
    resp.text.substring(0, 200),
  );
  return resp.text.trim();
}
