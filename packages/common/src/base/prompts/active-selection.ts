import type { ActiveSelection } from "../../vscode-webui-bridge/types/message";

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
