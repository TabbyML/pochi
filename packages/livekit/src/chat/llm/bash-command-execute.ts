import type { UIMessage } from "ai";

/**
 * Extracts bash commands from a markdown string and returns the list of commands.
 *
 * @param content The markdown content to parse.
 * @returns An array of bash commands.
 */
export function extractBashCommands(content: string): string[] {
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

export type BashCommandExecutor = (
  command: string,
  abortSignal: AbortSignal,
) => Promise<{ output: string; error?: string }>;

export async function executeBashCommands(
  content: string,
  abortSignal: AbortSignal,
  bashCommandExecutor?: BashCommandExecutor,
): Promise<{ command: string; output: string; error?: string }[]> {
  if (!bashCommandExecutor) return [];
  const commands = extractBashCommands(content);
  const results: { command: string; output: string; error?: string }[] = [];
  for (const command of commands) {
    if (abortSignal.aborted) {
      break;
    }

    try {
      const { output, error } = await bashCommandExecutor(command, abortSignal);
      results.push({ command, output, error });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ command, output: "", error });
      // The AbortError is a specific error that should stop the whole process.
      if (e instanceof Error && e.name === "AbortError") {
        break;
      }
    }
  }
  return results;
}

export function extractWorkflowContents(message: UIMessage): string[] {
  const tag = "workflow";
  const regex = new RegExp(`<${tag}([^>]*)>(.*?)<\/${tag}>`, "gs");
  const results: string[] = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      const matches = part.text.matchAll(regex);
      for (const match of matches) {
        const content = match[2];
        results.push(content);
      }
    }
  }
  return results;
}
