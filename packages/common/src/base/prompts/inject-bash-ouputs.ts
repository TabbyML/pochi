import type { TextUIPart, UIMessage } from "ai";
import { prompts } from ".";
import { isWorkflowTextPart } from "../../message-utils";

export function injectBashOutputs(
  message: UIMessage,
  outputs: {
    command: string;
    output: string;
    error?: string | undefined;
  }[],
) {
  if (outputs.length) {
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
        `Bash command outputs:\n${bashCommandOutputs.join("\n\n")}`,
      ),
    } satisfies TextUIPart;
    const workflowPartIndex = message.parts.findIndex(isWorkflowTextPart);
    const indexToInsert = workflowPartIndex === -1 ? 0 : workflowPartIndex;
    message.parts = [
      ...message.parts.slice(0, indexToInsert),
      reminderPart,
      ...message.parts.slice(indexToInsert),
    ];
  }
}
