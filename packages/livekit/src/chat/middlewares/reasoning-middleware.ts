import type {
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { getPotentialStartIndex } from "./utils";

export function createReasoningMiddleware(
  tag = "think",
): LanguageModelV3Middleware {
  const tagStart = `<${tag}>`;
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

            function publish(text: string) {
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

            do {
              if (isReasoning) {
                const endIndex = getPotentialStartIndex(buffer, tagEnd);
                if (endIndex === null) {
                  publish(buffer);
                  buffer = "";
                  break;
                }

                publish(buffer.slice(0, endIndex));

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
                const startIndex = getPotentialStartIndex(buffer, tagStart);
                if (startIndex === null) {
                  publish(buffer);
                  buffer = "";
                  break;
                }
                publish(buffer.slice(0, startIndex));
                const foundFullStartMatch =
                  startIndex + tagStart.length <= buffer.length;
                if (foundFullStartMatch) {
                  buffer = buffer.slice(startIndex + tagStart.length);
                  isReasoning = true;
                  countReasoning++;
                  controller.enqueue({
                    type: "reasoning-start",
                    id: getReasoningId(),
                  });
                } else {
                  buffer = buffer.slice(startIndex);
                  break;
                }
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
}
