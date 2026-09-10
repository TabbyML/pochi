import type {
  LanguageModelV3Middleware,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { getPotentialStartIndex } from "./utils";

/**
 * Provider metadata namespace used to remember how the reasoning tag was
 * originally written by the model, so it can be echoed back verbatim in
 * follow-up requests.
 */
export const ReasoningTagMetadataKey = "pochiReasoningTag";

export type ReasoningTagMetadata = {
  /** The tag name, e.g. `think`. */
  tag: string;
  /** The raw attributes of the opening tag, e.g. ` signature="abc"`. */
  attributes: string;
};

export function createReasoningMiddleware(
  tag = "think",
): LanguageModelV3Middleware {
  // The opening tag may carry attributes, e.g. `<think signature="abc">`.
  const tagStartPrefix = `<${tag}`;
  const tagStartRegex = new RegExp(`^<${escapeRegExp(tag)}(\\s[^>]*)?>$`);
  const tagEnd = `</${tag}>`;
  let countReasoning = 0;
  let textId = "";
  let buffer = "";
  let pendingTextStart:
    | Extract<LanguageModelV3StreamPart, { type: "text-start" }>
    | undefined = undefined;
  let isFirstReasoning = true;
  let isReasoning = false;

  function getReasoningId() {
    return `reasoning-${countReasoning}`;
  }

  return {
    specificationVersion: "v3",
    /**
     * Models parsed by this middleware emit their reasoning as part of the text
     * content, so the reasoning has to be sent back in the very same format:
     * providers either drop reasoning parts or map them to a dedicated field
     * the model never wrote itself.
     */
    transformParams: async ({ params }) => ({
      ...params,
      prompt: params.prompt.map((message) =>
        message.role === "assistant"
          ? { ...message, content: serializeReasoning(message.content) }
          : message,
      ) as LanguageModelV3Prompt,
    }),
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      const transformedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller) {
            if (chunk.type === "text-start") {
              textId = chunk.id;
              pendingTextStart = chunk;
              return;
            }

            if (chunk.type === "text-end") {
              // Flush whatever is left in the buffer: it can hold an
              // incomplete tag that will never be completed.
              if (buffer.length > 0) {
                publish(controller, buffer);
                buffer = "";
              }
              if (isReasoning) {
                isReasoning = false;
                controller.enqueue({
                  type: "reasoning-end",
                  id: getReasoningId(),
                });
              }
              textId = "";
              // Skip entire text section if it's empty.
              if (pendingTextStart) {
                pendingTextStart = undefined;
                return;
              }
            }

            if (chunk.type !== "text-delta") {
              controller.enqueue(chunk);
              return;
            }

            buffer += chunk.delta;

            do {
              if (isReasoning) {
                const endIndex = getPotentialStartIndex(buffer, tagEnd);
                if (endIndex === null) {
                  publish(controller, buffer);
                  buffer = "";
                  break;
                }

                publish(controller, buffer.slice(0, endIndex));

                const foundFullEndMatch =
                  endIndex + tagEnd.length <= buffer.length;

                if (foundFullEndMatch) {
                  buffer = buffer.slice(endIndex + tagEnd.length);
                  isReasoning = false;
                  controller.enqueue({
                    type: "reasoning-end",
                    id: getReasoningId(),
                  });
                } else {
                  buffer = buffer.slice(endIndex);
                  break;
                }
              } else {
                const startIndex = getPotentialStartIndex(
                  buffer,
                  tagStartPrefix,
                );
                if (startIndex === null) {
                  publish(controller, buffer);
                  buffer = "";
                  break;
                }

                const foundFullStartPrefix =
                  startIndex + tagStartPrefix.length <= buffer.length;
                if (!foundFullStartPrefix) {
                  publish(controller, buffer.slice(0, startIndex));
                  buffer = buffer.slice(startIndex);
                  break;
                }

                const tagEndIndex = buffer.indexOf(">", startIndex);
                if (tagEndIndex < 0) {
                  // The opening tag is not complete yet, wait for more deltas.
                  publish(controller, buffer.slice(0, startIndex));
                  buffer = buffer.slice(startIndex);
                  break;
                }

                const tagStart = buffer.slice(startIndex, tagEndIndex + 1);
                const match = tagStart.match(tagStartRegex);
                if (!match) {
                  // A different tag sharing the same prefix, e.g. `<thinking>`.
                  publish(controller, buffer.slice(0, tagEndIndex + 1));
                  buffer = buffer.slice(tagEndIndex + 1);
                  continue;
                }

                publish(controller, buffer.slice(0, startIndex));
                buffer = buffer.slice(startIndex + tagStart.length);
                isReasoning = true;
                countReasoning++;
                const attributes = match[1] ?? "";
                controller.enqueue({
                  type: "reasoning-start",
                  id: getReasoningId(),
                  ...(attributes
                    ? {
                        providerMetadata: {
                          [ReasoningTagMetadataKey]: {
                            tag,
                            attributes,
                          } satisfies ReasoningTagMetadata,
                        },
                      }
                    : {}),
                });
              }

              // biome-ignore lint/correctness/noConstantCondition: This loop intentionally runs indefinitely, processing the buffer in chunks until no more complete tags can be found. The loop breaks internally based on buffer content and parsing progress.
            } while (true);
          },
        }),
      );
      return {
        stream: transformedStream,
        ...rest,
      };
    },
  };

  /**
   * Renders assistant reasoning content back into the tag the model used, e.g.
   * `<think signature="abc">...</think>`.
   */
  function serializeReasoning(
    content: Extract<
      LanguageModelV3Prompt[number],
      { role: "assistant" }
    >["content"],
  ) {
    return content.map((part) => {
      if (part.type !== "reasoning") return part;

      const { [ReasoningTagMetadataKey]: metadata, ...providerOptions } =
        part.providerOptions ?? {};
      const tagName =
        typeof metadata?.tag === "string" && metadata.tag ? metadata.tag : tag;
      const attributes =
        typeof metadata?.attributes === "string" ? metadata.attributes : "";
      const separator = !attributes || attributes.startsWith(" ") ? "" : " ";

      return {
        type: "text" as const,
        text: `<${tagName}${separator}${attributes}>${part.text}</${tagName}>`,
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      };
    });
  }

  function publish(
    controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
    text: string,
  ) {
    if (text.length === 0) return;
    const isEmptyText = text.trim().length === 0;
    if (isReasoning) {
      if (isFirstReasoning && isEmptyText) {
        // Skip
      } else {
        controller.enqueue({
          id: getReasoningId(),
          type: "reasoning-delta",
          delta: text,
        });
      }
      isFirstReasoning = false;
    } else {
      if (pendingTextStart && isEmptyText) {
        // Skip
      } else {
        if (pendingTextStart) {
          controller.enqueue(pendingTextStart);
          pendingTextStart = undefined;
        }
        controller.enqueue({
          id: textId,
          type: "text-delta",
          delta: text,
        });
      }
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
