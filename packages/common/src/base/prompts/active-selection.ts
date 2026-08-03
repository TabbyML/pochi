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
  const { terminalName, backgroundJobId, content } = selection;
  if (!content || content.trim() === "") {
    return "";
  }

  const header =
    "The user has selected text in their integrated terminal. This context is provided to help you understand what the user is currently focused on or referring to.";

  const attrs = renderTerminalSelectionAttrs(terminalName, backgroundJobId);

  return `${header}\n\n<active-terminal-selection ${attrs}>\n\`\`\`\n${content}\n\`\`\`\n</active-terminal-selection>`;
}

/** @internal exported for reuse by terminal-context.ts */
export function renderTerminalSelectionAttrs(
  terminalName: string,
  backgroundJobId: string | undefined,
): string {
  return backgroundJobId
    ? `terminal="${terminalName}" backgroundJobId="${backgroundJobId}"`
    : `terminal="${terminalName}"`;
}
