import type {
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { isUserInputToolName } from "@getpochi/tools";

// Middleware rules:
// 1. If there are already any tool calls (todoWrite excluded) in the current step, attemptCompletion/askFollowupQuestions are not allowed.
// 2. If there is already an attemptCompletion/askFollowupQuestions in the current step, further tool calls are not allowed.

export function createFilterCompletionToolsMiddleware(): LanguageModelV2Middleware {
  return {
    middlewareVersion: "v2",
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let stepState: undefined | "hasOtherTools" | "hasCompletionTool" =
        undefined;
      let completionToolId: string | undefined = undefined;
      const filterOutToolIds: string[] = [];

      const transformedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV2StreamPart,
          LanguageModelV2StreamPart
        >({
          async transform(chunk, controller) {
            // attempt to update state
            if (stepState === undefined && chunk.type === "tool-input-start") {
              if (isUserInputToolName(chunk.toolName)) {
                stepState = "hasCompletionTool";
                completionToolId = getToolCallId(chunk);
              } else if (chunk.toolName !== "todoWrite") {
                stepState = "hasOtherTools";
              }
            }

            // filter out futher toolcalls when already has completion tool
            if (
              stepState === "hasCompletionTool" &&
              chunk.type === "tool-input-start" &&
              getToolCallId(chunk) !== completionToolId
            ) {
              const toolcallId = getToolCallId(chunk);
              if (!filterOutToolIds.includes(toolcallId)) {
                filterOutToolIds.push(toolcallId);
              }
              return;
            }

            // filter out attemptCompletion/askFollowupQuestions toolcalls when already has other tools
            if (
              stepState === "hasOtherTools" &&
              chunk.type === "tool-input-start" &&
              isUserInputToolName(chunk.toolName)
            ) {
              const toolcallId = getToolCallId(chunk);
              if (!filterOutToolIds.includes(toolcallId)) {
                filterOutToolIds.push(toolcallId);
              }
              return;
            }

            if (
              (chunk.type === "tool-input-delta" ||
                chunk.type === "tool-input-end" ||
                chunk.type === "tool-call") &&
              filterOutToolIds.includes(getToolCallId(chunk))
            ) {
              // filter out
              return;
            }

            controller.enqueue(chunk);
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

function getToolCallId(
  part: Extract<
    LanguageModelV2StreamPart,
    | { type: "tool-input-start" }
    | { type: "tool-input-delta" }
    | { type: "tool-input-end" }
    | { type: "tool-call" }
  >,
): string {
  switch (part.type) {
    case "tool-input-start":
      return part.id;
    case "tool-input-delta":
      return part.id;
    case "tool-input-end":
      return part.id;
    case "tool-call":
      return part.toolCallId;
  }
}
