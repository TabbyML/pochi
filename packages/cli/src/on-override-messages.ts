import { exec } from "node:child_process";
import { prompts } from "@getpochi/common";
import { extractWorkflowBashCommands } from "@getpochi/common/message-utils";
import type { UIMessage } from "ai";

export function createOnOverrideMessages(cwd: string) {
  return async function onOverrideMessages({
    messages,
  }: { messages: UIMessage[] }) {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "user") {
      await appendWorkflowBashOutputs(cwd, lastMessage);
    }
  };
}

async function appendWorkflowBashOutputs(cwd: string, message: UIMessage) {
  if (message.role !== "user") return;

  const commands = extractWorkflowBashCommands(message);
  if (!commands.length) return [];

  const bashCommandResults: {
    command: string;
    output: string;
    error?: string;
  }[] = [];
  for (const command of commands) {
    try {
      const { output, error } = await executeBashCommand(cwd, command);
      bashCommandResults.push({ command, output, error });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      bashCommandResults.push({ command, output: "", error });
      // The AbortError is a specific error that should stop the whole process.
      if (e instanceof Error && e.name === "AbortError") {
        break;
      }
    }
  }

  if (bashCommandResults.length) {
    prompts.injectBashOutputs(message, bashCommandResults);
  }
}

function executeBashCommand(
  cwd: string,
  command: string,
): Promise<{ output: string; error?: string }> {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({ output: stdout, error: stderr || error.message });
      } else {
        resolve({ output: stdout });
      }
    });
  });
}
