import type { ActiveSelection, TerminalTextSelection } from "../message";

export function renderActiveSelection(selection: ActiveSelection): string {
  if (!selection) {
    return "";
  }
  const { filepath, range, content, notebookCell } = selection;
  if (!content || content.trim() === "") {
    return "";
  }

  const location = notebookCell
    ? `${filepath} (Cell ID: ${notebookCell.cellId})`
    : `${filepath}:${range.start.line + 1}-${range.end.line + 1}`;

  const header =
    "The user has an active selection in their editor. This selection context is provided to help you understand what code the user is currently focused on or referring to.";

  return `${header}\n\n<active-selection location="${location}">\n\`\`\`\n${content}\n\`\`\`\n</active-selection>`;
}

export function renderTerminalTextSelection(
  selection: TerminalTextSelection | undefined,
): string {
  if (!selection) {
    return "";
  }
  const { terminalName, content } = selection;
  if (!content || content.trim() === "") {
    return "";
  }

  const header =
    "The user has selected text in their integrated terminal. This context is provided to help you understand what the user is currently focused on or referring to.";

  return `${header}\n\n<terminal-selection terminal="${terminalName}">\n\`\`\`\n${content}\n\`\`\`\n</terminal-selection>`;
}
