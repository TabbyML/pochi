import type { UIMessage } from "ai";
import micromatch from "micromatch";

/**
 * Extracts bash commands from a markdown string, validates them against a set of allowed patterns,
 * and returns the list of valid commands.
 *
 * @param content The markdown content to parse.
 * @param allowedTools A record where keys are tool names (e.g., "Bash") and values are arrays of glob patterns for allowed commands.
 * @returns An array of valid bash commands.
 */
export function extractBashCommands(
  content: string,
  allowedTools: Record<string, string[]> | undefined,
): string[] {
  const commands: string[] = [];
  const allowedBashPatterns = allowedTools?.Bash ?? [];
  const commandRegex = /!\`(.+?)\`/g;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: off
  while ((match = commandRegex.exec(content)) !== null) {
    const actualCommand = match[1].trim();
    if (actualCommand) {
      const isAllowed = allowedBashPatterns.some((pattern) => {
        if (pattern.endsWith(":*")) {
          const baseCommand = pattern.slice(0, -2);
          return (
            actualCommand === baseCommand ||
            actualCommand.startsWith(`${baseCommand} `)
          );
        }
        return micromatch.isMatch(actualCommand, pattern);
      });

      if (isAllowed) {
        commands.push(actualCommand);
      }
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
  allowedTools: Record<string, string[]> | undefined,
  abortSignal: AbortSignal,
  bashCommandExecutor?: BashCommandExecutor,
): Promise<{ command: string; output: string; error?: string }[]> {
  if (!bashCommandExecutor) return [];
  const commands = extractBashCommands(content, allowedTools);
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

export function parseWorkflowsFromMessage(message: UIMessage): Array<{
  content: string;
  allowedTools: Record<string, string[]> | undefined;
}> {
  const tag = "workflow";
  const regex = new RegExp(`<${tag}([^>]*)>(.*?)<\/${tag}>`, "gs");
  const results: Array<{
    content: string;
    allowedTools: Record<string, string[]> | undefined;
  }> = [];

  for (const part of message.parts) {
    if (part.type === "text") {
      const matches = part.text.matchAll(regex);
      for (const match of matches) {
        const attributes = match[1];
        const content = match[2];

        const allowedToolsAttrRegex = /allowed-tools="([^\"]*)"/;
        const allowedToolsMatch = attributes.match(allowedToolsAttrRegex);
        const rawAllowedTools = allowedToolsMatch
          ? allowedToolsMatch[1]
          : undefined;

        const allowedTools = parseAllowedTools(rawAllowedTools);

        results.push({
          content,
          allowedTools,
        });
      }
    }
  }
  return results;
}

function parseAllowedTools(
  allowedToolsInput: string | undefined,
): Record<string, string[]> | undefined {
  if (!allowedToolsInput) {
    return undefined;
  }

  const toolStrings = allowedToolsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toolConfig: Record<string, string[]> = {};

  for (const toolString of toolStrings) {
    const match = toolString.match(/(\w+)(?:\((.*)\))?/);
    if (match) {
      const [, toolName, toolArgs] = match;
      if (!toolConfig[toolName]) {
        toolConfig[toolName] = [];
      }
      if (toolArgs) {
        toolConfig[toolName].push(toolArgs);
      }
    }
  }

  return toolConfig;
}
