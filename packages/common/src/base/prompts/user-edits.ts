import type { UserEdits } from "../../vscode-webui-bridge/types/message";

export function renderUserEdits(userEdits: UserEdits): string {
  if (!userEdits || userEdits.length === 0) {
    return "";
  }

  const header =
    "The user has made the following edits to the workspace since the last checkpoint. Please take these changes into account when proceeding with the task.";

  const formattedFiles = userEdits
    .map((edit) => {
      return `<user-edit filepath="${edit.filepath}">\n\`\`\`diff\n${edit.diff}\n\`\`\`\n</user-edit>`;
    })
    .join("\n\n");

  return `${header}\n\n${formattedFiles}`;
}
