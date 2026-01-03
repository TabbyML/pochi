import type { TextUIPart, UIMessage } from "ai";
import { prompts } from "./index";

export function injectBashOutputs(
  message: UIMessage,
  outputs: {
    command: string;
    output: string;
    error?: string | undefined;
  }[],
) {
  const bashCommandOutputs = outputs.map(({ command, output, error }) => {
    let result = `$ ${command}`;
    if (output) {
      result += `\n${output}`;
    }
    if (error) {
      result += `\nERROR: ${error}`;
    }
    return result;
  });

  const reminderPart = {
    type: "text",
    text: prompts.createSystemReminder(
      `Bash command output referred from workflow:\n${bashCommandOutputs.join("\n\n")}`,
    ),
  } satisfies TextUIPart;

  const workflowPartIndex = message.parts.findIndex(isWorkflowTextPart);
  const indexToInsert = workflowPartIndex === -1 ? 0 : workflowPartIndex + 1;
  message.parts = [
    ...message.parts.slice(0, indexToInsert),
    reminderPart,
    ...message.parts.slice(indexToInsert),
  ];
}

function isWorkflowTextPart(part: UIMessage["parts"][number]) {
  return (
    part.type === "text" && /<workflow[^>]*>(.*?)<\/workflow>/gs.test(part.text)
  );
}
