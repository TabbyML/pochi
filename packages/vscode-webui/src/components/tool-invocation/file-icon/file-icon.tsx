import { cn } from "@/lib/utils";
import { Folder } from "lucide-react";
import iconTheme from "./vs-seti-icon-theme.json";
import "./seti-icons.css";
import { type Theme, useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";

interface IconData {
  file: string;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  languageIds: Record<string, string>;
}

interface IconTheme extends IconData {
  iconDefinitions: Record<
    string,
    {
      fontCharacter: string;
      fontColor?: string;
    }
  >;
  light: IconData;
}

import {
  getFileExtension,
  languageIdFromExtension,
} from "@/lib/utils/languages";

const typedIconTheme = iconTheme as unknown as IconTheme;

const getFileName = (path: string): string => {
  return path.split("/").pop() || "";
};

const getIconForFile = (path: string, theme: Theme = "dark"): string => {
  const fileName = getFileName(path);
  const extension = getFileExtension(path);
  const isLightTheme = theme === "light";

  const themeData: IconData = isLightTheme
    ? typedIconTheme.light
    : typedIconTheme;

  if (fileName && themeData.fileNames && themeData.fileNames[fileName]) {
    return themeData.fileNames[fileName];
  }

  if (
    extension &&
    themeData.fileExtensions &&
    themeData.fileExtensions[extension]
  ) {
    return themeData.fileExtensions[extension];
  }

  const languageId = languageIdFromExtension(extension);
  if (
    languageId &&
    themeData.languageIds &&
    themeData.languageIds[languageId]
  ) {
    return themeData.languageIds[languageId];
  }

  return typedIconTheme.file || "_default";
};

const File: React.FC<{
  path: string;
  theme: Theme;
  className?: string;
  defaultIconClassName?: string;
}> = ({ className, path, theme, defaultIconClassName }) => {
  const { t } = useTranslation();
  const iconId = getIconForFile(path, theme);

  return (
    <span
      className={cn(className, "icon", `icon${iconId}`, "text-lg/4", {
        [defaultIconClassName ?? ""]: iconId === "_default",
      })}
      title={path}
      aria-label={t("fileIcon.fileAriaLabel", { path })}
    />
  );
};

export const FileIcon: React.FC<{
  path: string;
  className?: string;
  isDirectory?: boolean;
  defaultIconClassName?: string;
}> = ({ path, className, isDirectory = false, defaultIconClassName }) => {
  const { theme } = useTheme();
  return isDirectory ? (
    <Folder
      className={cn(
        "mx-0.5 inline size-3 w-[15px] text-blue-600 dark:text-blue-400",
        className,
      )}
    />
  ) : (
    <File
      className={className}
      path={path}
      theme={theme}
      defaultIconClassName={defaultIconClassName}
    />
  );
};
