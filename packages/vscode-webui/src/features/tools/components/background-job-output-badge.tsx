import { useBackgroundJobInfo } from "@/features/chat";
import type { BackgroundJobOutputFileInfo } from "@getpochi/common/pochi-file-system";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { FileBadge, getFileBadgeDisplayLabel } from "./file-badge";

/**
 * A background job transcript rendered as its job identity (e.g. `%1 output`)
 * instead of the full, noisy log path. The badge still opens the real file.
 */
export const BackgroundJobOutputBadge: FC<{
  path: string;
  outputFile: BackgroundJobOutputFileInfo;
  startLine?: number;
  endLine?: number;
  className?: string;
}> = ({ path, outputFile, startLine, endLine, className }) => {
  const { t } = useTranslation();
  const info = useBackgroundJobInfo(
    outputFile.kind === "job" ? outputFile.backgroundJobId : undefined,
  );
  // Only a tracked job has a display id; otherwise keep the path readable.
  const label =
    outputFile.kind === "terminal"
      ? t("fileBadge.terminalOutput")
      : info?.command
        ? t("fileBadge.backgroundJobOutput", { displayId: info.displayId })
        : undefined;

  return (
    <FileBadge
      path={path}
      label={label}
      title={label ? getFileBadgeDisplayLabel(path) : undefined}
      startLine={startLine}
      endLine={endLine}
      className={className}
    />
  );
};
