const MaxTerminalNameLength = 24;

/**
 * Creates a concise, stable terminal tab label for background jobs.
 *
 * Long commands often begin with inline environment variables. Showing those in
 * the terminal title makes VS Code tabs unreadable, so strip only leading env
 * assignments and keep the actual command visible.
 */
export function getBackgroundJobTerminalName(command: string): string {
  const title =
    stripLeadingEnvAssignments(command).replace(/\s+/g, " ").trim() ||
    "Background Job";

  if (title.length <= MaxTerminalNameLength) {
    return title;
  }

  return `${title.slice(0, MaxTerminalNameLength - 1)}…`;
}

function stripLeadingEnvAssignments(command: string): string {
  const trimmedCommand = command.trim();
  let remainingCommand = trimmedCommand;

  while (remainingCommand) {
    const token = readShellToken(remainingCommand);

    if (!token || !isEnvAssignment(token.value)) {
      break;
    }

    remainingCommand = remainingCommand.slice(token.end).trimStart();
  }

  return remainingCommand || trimmedCommand;
}

function readShellToken(
  input: string,
): { value: string; end: number } | undefined {
  if (!input) {
    return undefined;
  }

  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      return { value: input.slice(0, index), end: index };
    }
  }

  return { value: input, end: input.length };
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}
