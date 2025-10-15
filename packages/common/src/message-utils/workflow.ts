import type { UIMessage } from "ai";

/**
 * Extracts bash commands from a markdown string and returns the list of commands.
 *
 * @param content The markdown content to parse.
 * @returns An array of bash commands.
 */
function extractBashCommands(content: string): string[] {
  const commands: string[] = [];
  const commandRegex = /!\`(.+?)\`/g;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: off
  while ((match = commandRegex.exec(content)) !== null) {
    const actualCommand = match[1].trim();
    if (actualCommand) {
      commands.push(actualCommand);
    }
  }

  return commands;
}

const tag = "workflow";
const workflowRegex = new RegExp(`<${tag}([^>]*)>(.*?)<\/${tag}>`, "gs");

export function extractWorkflowBashCommands(message: UIMessage): string[] {
  const workflowContents: string[] = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      const matches = part.text.matchAll(workflowRegex);
      for (const match of matches) {
        const content = match[2];
        workflowContents.push(content);
      }
    }
  }
  let commands: string[] = [];
  for (const x of workflowContents) {
    commands = commands.concat(extractBashCommands(x));
  }
  return commands;
}

export function isWorkflowTextPart(part: UIMessage["parts"][number]) {
  return part.type === "text" && workflowRegex.test(part.text);
}
