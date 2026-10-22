import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { SocialLinks, prompts } from "@getpochi/common";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  CheckIcon,
  CopyIcon,
  MessageSquareShare,
  RefreshCwIcon,
  Share2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface PublicShareButtonProps {
  disabled?: boolean;
  task?: Task;
  onError?: (e: Error) => void;
  modelId?: string;
  displayError?: string;
  onUpdateIsPublicShared?: (isPublicShared: boolean) => void;
}

export function PublicShareButton({
  disabled,
  modelId,
  displayError,
  task,
  onUpdateIsPublicShared,
}: PublicShareButtonProps) {
  const { t } = useTranslation();
  const menuItemRef = useRef<"share" | "support">(null);
  const shareId = task?.shareId;
  const isPublicShared = task?.isPublicShared;
  const [open, setOpen] = useState(false);
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const syncStatus = useSyncStatus(useDefaultStore(), {
    taskId: task?.id,
    enabled: open,
  });
  const syncLabel = t(
    syncStatus.error ? "share.sync.failed" : `share.sync.${syncStatus.state}`,
  );

  const doCopy = (content: string) => {
    if (isCopied) return;
    copyToClipboard(content);
    setTimeout(() => {
      setOpen(false);
    }, 1000);
  };

  const handleCopyLink: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!shareId) return;
    menuItemRef.current = "share";
    e.preventDefault();
    const shareUrl = `${getServerBaseUrl()}/share/${shareId}`;
    doCopy(shareUrl);
  };

  const handleShareSupport: React.MouseEventHandler<HTMLDivElement> = async (
    e,
  ) => {
    if (!shareId) return;
    menuItemRef.current = "support";
    e.preventDefault();
    const version = await vscodeHost.readExtensionVersion();
    const environment = await vscodeHost.readEnvironment({
      webviewKind: globalThis.POCHI_WEBVIEW_KIND,
      taskId: task?.id,
    });
    const shareUrl = `${getServerBaseUrl()}/share/${shareId}`;

    const environmentInfo = prompts.environment(environment, undefined);
    const supportInfo = `# Support Information

**Extension version**: ${version ?? "N/A"}

**Model**: ${modelId ?? "N/A"}

**Link**: ${shareUrl}

**Display error**:
\`\`\`
${displayError ?? "N/A"}
\`\`\`

${environmentInfo}

`;
    vscodeHost.capture({
      event: "shareSupport",
      properties: {
        uid: shareId,
        text: supportInfo,
      },
    });
    doCopy(supportInfo);
    const openDiscordButtonText = t("share.joinDiscord");
    const result = await vscodeHost.showInformationMessage(
      t("share.shareSupportTitle"),
      {
        modal: true,
        detail: t("share.shareSupportDetails", { shareId }),
      },
      openDiscordButtonText,
      t("share.ok"),
    );

    if (result === openDiscordButtonText) {
      await vscodeHost.openExternal(SocialLinks.Discord);
    }
  };

  const handleUpdatePublicShare: React.MouseEventHandler<HTMLDivElement> = (
    e,
  ) => {
    e.preventDefault();
    onUpdateIsPublicShared?.(true);
  };

  const handleUpdatePrivateShare: React.MouseEventHandler<HTMLDivElement> = (
    e,
  ) => {
    e.preventDefault();
    onUpdateIsPublicShared?.(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="button-focus h-6 w-6 p-0"
          disabled={!shareId || disabled}
          title={shareId && syncStatus.error ? syncLabel : undefined}
        >
          <span className="relative">
            <Share2Icon className="size-4" />
            {shareId && syncStatus.error && (
              <span
                data-testid="sync-status-dot"
                data-sync-state={syncStatus.state}
                className="-right-0.5 -bottom-0.5 absolute size-1.5 rounded-full bg-destructive"
              />
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="dropdown-menu animate-in overflow-hidden rounded-md border bg-background p-1 text-popover-foreground shadow"
      >
        <DropdownMenuItem
          disabled={syncStatus.isRequesting}
          aria-busy={syncStatus.isLoading || syncStatus.isRequesting}
          title={t("share.sync.description")}
          onSelect={(event) => {
            event.preventDefault();
            void syncStatus.sync().catch(() => {});
          }}
          className="cursor-pointer py-2 data-[disabled]:opacity-100"
        >
          <RefreshCwIcon
            className={
              !syncStatus.isLoading && syncStatus.state === "syncing"
                ? "mr-2 size-4 animate-spin"
                : "mr-2 size-4"
            }
          />
          <div className="flex flex-col gap-0.5">
            <span>{t("share.sync.toRemote")}</span>
            {syncStatus.isLoading ? (
              <Skeleton
                aria-hidden="true"
                className="h-2 w-16 bg-[var(--vscode-inputOption-hoverBackground)]"
              />
            ) : (
              <span
                data-testid="sync-status-label"
                title={syncStatus.error ?? undefined}
                className="text-muted-foreground text-xs"
              >
                {syncLabel}
              </span>
            )}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleUpdatePublicShare}
          disabled={!shareId}
          className="cursor-pointer"
        >
          {isPublicShared ? (
            <CheckIcon className="mr-2 size-4" />
          ) : (
            <div className="mr-2 size-4" />
          )}
          {t("share.setPublic")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleUpdatePrivateShare}
          disabled={!shareId}
          className="cursor-pointer"
        >
          {!isPublicShared ? (
            <CheckIcon className="mr-2 size-4" />
          ) : (
            <div className="mr-2 size-4" />
          )}
          {t("share.setPrivate")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleCopyLink}
          disabled={!shareId}
          className="cursor-pointer"
        >
          {menuItemRef.current === "share" && isCopied ? (
            <CheckIcon className="mr-2 size-4 text-success" />
          ) : (
            <CopyIcon className="mr-2 size-4" />
          )}
          {t("share.copyLink")}
          {!shareId && (
            <span className="ml-2 text-muted-foreground text-xs">
              {t("share.shareFirst")}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleShareSupport}
          disabled={!shareId}
          className="cursor-pointer"
        >
          {menuItemRef.current === "support" && isCopied ? (
            <CheckIcon className="mr-2 size-4 text-success" />
          ) : (
            <MessageSquareShare className="mr-2 size-4" />
          )}
          {t("share.shareSupport")}
          {!shareId && (
            <span className="ml-2 text-muted-foreground text-xs">
              {t("share.shareFirst")}
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
