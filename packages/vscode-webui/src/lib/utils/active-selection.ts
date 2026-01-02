import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import type { TFunction } from "i18next";
import { getFileName } from "./file";

export const getActiveSelectionLabel = (
  activeSelection: ActiveSelection,
  t: TFunction,
) => {
  if (!activeSelection) return "";

  const filename = getFileName(activeSelection.filepath);

  if (activeSelection.notebookCell) {
    const cellIndex = activeSelection.notebookCell.cellIndex + 1;
    return `${filename} • ${t("activeSelectionBadge.cell")} ${cellIndex}`;
  }

  return filename;
};
