import type { Message } from "@getpochi/livekit";
import type { ClientTools } from "@getpochi/tools";
import type { InferToolInput } from "ai";
import type { TFunction } from "i18next";

export function convertSubtaskMessages(
  messages: Message[],
  t: TFunction<"translation", undefined>,
) {
  return messages.map((message) => {
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type === "tool-newTask") {
          const input = part.input as InferToolInput<ClientTools["newTask"]>;
          const error =
            part.state === "output-available" &&
            typeof part.output === "object" &&
            part.output !== null &&
            "error" in part.output &&
            typeof part.output.error === "string"
              ? part.output.error
              : part.state === "output-error"
                ? part.errorText
                : undefined;
          const output =
            part.state === "output-available" && !error
              ? part.output.result
              : undefined;

          return {
            type: "text",
            text: [
              `#### [${input.agentType ?? "Subtask"}] ${input.description}`,
              output
                ? `${t("forkTask.subTaskSummary.completed")}  \n${output}`
                : error
                  ? `${t("forkTask.subTaskSummary.error")} \n${error}`
                  : t("forkTask.subTaskSummary.noOutput"),
            ].join("  \n"),
          };
        }
        return part;
      }),
    };
  });
}
