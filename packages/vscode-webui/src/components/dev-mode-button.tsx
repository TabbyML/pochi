import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsDevMode } from "@/features/settings";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { convertToModelMessages } from "ai";
import { CheckIcon, CopyIcon, FileDiff, Gavel, StoreIcon } from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

interface UpdatedCopyMenuItemProps {
  fetchContent: () => Promise<string> | string; // Can be sync or async
  text: string;
}

function CopyMenuItem({ fetchContent, text }: UpdatedCopyMenuItemProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCopied) return;
    const contentToCopy = await Promise.resolve(fetchContent());
    copyToClipboard(contentToCopy);
  };

  return (
    <DropdownMenuItem onClick={handleClick} className="cursor-pointer">
      {isCopied ? (
        <CheckIcon className="inline text-success" />
      ) : (
        <CopyIcon className="inline" />
      )}
      <span className="ml-2">{text}</span>
    </DropdownMenuItem>
  );
}

interface DevModeButtonProps {
  messages: Message[];
  todos: Todo[] | undefined;
}

export function DevModeButton({ messages, todos }: DevModeButtonProps) {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  const getMessagesContent = () => {
    const x = messages.map((x) => {
      return {
        ...x,
        toolInvocations: undefined,
      };
    });
    return JSON.stringify(x, null, 2);
  };
  const getCoreMessagesContent = () => {
    const coreMessages = convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
    });
    return JSON.stringify(coreMessages, null, 2);
  };

  const getTodosContent = () => {
    return JSON.stringify(todos, null, 2);
  };

  const getCheckpintCommand = useCallback(async () => {
    const checkpointPath = await vscodeHost.readCheckpointPath();
    if (!checkpointPath) {
      return t("devModeButton.noCheckpointAvailable");
    }
    const workspaceInfo = await vscodeHost.readCurrentWorkspace();
    return `alias pgit="git --git-dir=\\"${checkpointPath}\\" --work-tree=\\"${workspaceInfo.cwd}\\""`;
  }, [t]);

  if (!isDevMode) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="button-focus h-6 w-6 p-0"
          title={t("devModeButton.title")}
        >
          <Gavel className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          onCloseAutoFocus={(e) => e.preventDefault()}
          side="bottom"
          className="dropdown-menu max-h-[30vh] min-w-[12rem] animate-in overflow-y-auto overflow-x-hidden rounded-md border bg-background p-2 text-popover-foreground shadow"
        >
          <CopyMenuItem
            fetchContent={getMessagesContent}
            text={t("devModeButton.copyMessages")}
          />
          <CopyMenuItem
            fetchContent={getCoreMessagesContent}
            text={t("devModeButton.copyCoreMessages")}
          />
          <CopyMenuItem
            fetchContent={getCheckpintCommand}
            text={t("devModeButton.copyCheckpointCommand")}
          />
          <CopyMenuItem
            fetchContent={getTodosContent}
            text={t("devModeButton.copyTodos")}
          />
          <OpenDevStore />
          <ReviewChangesMenuItem />
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}

function OpenDevStore() {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const { jwt } = usePochiCredentials();
  const onClick = useCallback(() => {
    vscodeHost.openExternal(
      `http://localhost:4112/dev.html?storeId=${store.storeId}&jwt=${jwt}`,
    );
  }, [store.storeId, jwt]);
  if (import.meta.env.DEV && jwt && store) {
    return (
      <DropdownMenuItem onClick={onClick}>
        <StoreIcon className="inline" />
        <span className="ml-2">{t("devModeButton.openStore")}</span>
      </DropdownMenuItem>
    );
  }
}

function ReviewChangesMenuItem() {
  const { t } = useTranslation();
  const { data: currentWorkspace } = useCurrentWorkspace();

  const onClick = useCallback(() => {
    const cwd = currentWorkspace?.cwd;
    if (!cwd) return;

    vscodeHost.openTaskInPanel({
      type: "new-task",
      cwd,
      prompt: "review the current changes",
    });
  }, [currentWorkspace?.cwd]);

  return (
    <DropdownMenuItem onClick={onClick}>
      <FileDiff className="inline" />
      <span className="ml-2">{t("devModeButton.reviewChanges")}</span>
    </DropdownMenuItem>
  );
}
