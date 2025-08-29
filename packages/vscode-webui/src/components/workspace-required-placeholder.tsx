import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderOpenIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  isFetching: boolean;
  className?: string;
}

/**
 * A component to display when no workspace is active.
 * Shows a message and button prompting the user to open a workspace folder.
 */
export const WorkspaceRequiredPlaceholder = ({
  isFetching,
  className,
}: Props) => {
  const { t } = useTranslation();
  
  // During fetching, return an empty space instead of the placeholder
  // This prevents briefly showing the "open folder" prompt before workspace state gets updated
  // after a user has already opened a folder
  if (isFetching) {
    return (
      <div className={className}>
        <div className="h-[4.5rem]" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <p className="mb-3 text-center text-foreground/80">
        {t('workspace.required')}
      </p>
      <a
        className={cn(buttonVariants(), "!text-primary-foreground gap-1")}
        href="command:vscode.openFolder"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FolderOpenIcon className="mr-1.5 size-4" /> {t('common.openFolder')}
      </a>
    </div>
  );
};
