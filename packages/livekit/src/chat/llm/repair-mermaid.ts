import type { LanguageModelV2 } from "@ai-sdk/provider";
import { formatters, getLogger, prompts } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { convertToModelMessages, generateText } from "ai";
import { events } from "../../livestore/default-schema";
import type { Message } from "../../types";

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
  store: Store;
  taskId: string;
  model: LanguageModelV2;
  messages: Message[];
  chart: string;
  error: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  // Find all messages containing the mermaid diagram by searching through all parts
  // This is more reliable than using messageId since messages may be transformed in UI/DB
  const messagesWithMermaid = messages.filter((msg) =>
    msg.parts.some(
      (part) =>
        ((part.type === "text" || part.type === "reasoning") &&
          part.text.includes("```mermaid") &&
          part.text.includes(chart)) ||
        (part.type === "tool-attemptCompletion" &&
          part.input?.result?.includes("```mermaid") &&
          part.input?.result.includes(chart)),
    ),
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
      model,
      abortSignal,
      chart,
      error,
    );

    // Collect all updated messages
    const updatedMessages: Message[] = [];

    // Update all messages containing the chart
    for (const messageWithMermaid of messagesWithMermaid) {
      // Find and update the part with mermaid code, creating new objects to trigger updates
      let replaced = false;

      const updatedParts = messageWithMermaid.parts.map((part) => {
        if (
          (part.type === "text" || part.type === "reasoning") &&
          part.text.includes(chart)
        ) {
          // Escape special regex characters in the chart content
          const escapedChart = chart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // Create a regex pattern that matches the exact mermaid block with this chart
          const mermaidPattern = new RegExp(
            `\`\`\`mermaid\\s*\\n${escapedChart}\\s*\\n\`\`\``,
            "s",
          );
          // Replace the old mermaid code with the new one
          const newText = part.text.replace(
            mermaidPattern,
            `\`\`\`mermaid\n${fixedMermaid}\n\`\`\``,
          );
          if (newText !== part.text) {
            replaced = true;
            logger.debug("Replaced mermaid in message part", newText);
            return { ...part, text: newText };
          }
        }
        if (
          part.type === "tool-attemptCompletion" &&
          part.input?.result?.includes(chart)
        ) {
          // Escape special regex characters in the chart content
          const escapedChart = chart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // Create a regex pattern that matches the exact mermaid block with this chart
          const mermaidPattern = new RegExp(
            `\`\`\`mermaid\\s*\\n${escapedChart}\\s*\\n\`\`\``,
            "s",
          );
          // Replace the old mermaid code with the new one
          const newText = part.input.result.replace(
            mermaidPattern,
            `\`\`\`mermaid\n${fixedMermaid}\n\`\`\``,
          );
          if (newText !== part.input.result) {
            replaced = true;
            logger.debug("Replaced mermaid in tool completion input", newText);
            return {
              ...part,
              input: {
                ...part.input,
                result: newText,
              },
            };
          }
        }
        return part;
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
      store.commit(events.updateMessages({ messages: updatedMessages }));
      logger.debug(
        `Committed ${updatedMessages.length} updated message(s) to database`,
      );
    }
  } catch (err) {
    logger.warn("Failed to repair mermaid", err);
    throw err;
  }
}

async function generateFixedMermaid(
  taskId: string,
  model: LanguageModelV2,
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
        version: globalThis.POCHI_CLIENT,
        useCase: "repair-mermaid",
      },
    },
    model,
    prompt: convertToModelMessages(
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
