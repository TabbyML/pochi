import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationStatusIcon } from "@/components/ui/notification-row";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { SocialLinks, prompts } from "@getpochi/common";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  CheckIcon,
  CloudOffIcon,
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

export function PublicShareButton(props: PublicShareButtonProps) {
  const [open, setOpen] = useState(false);
  const syncStatus = useSyncStatus(useDefaultStore(), {
    taskId: props.task?.id,
    enabled: open,
  });
  return (
    <PublicShareButtonView
      {...props}
      open={open}
      onOpenChange={setOpen}
      syncStatus={syncStatus}
    />
  );
}

interface PublicShareButtonViewProps extends PublicShareButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncStatus: ReturnType<typeof useSyncStatus>;
}

export function PublicShareButtonView({
  disabled,
  modelId,
  displayError,
  task,
  onUpdateIsPublicShared,
  open,
  onOpenChange,
  syncStatus,
}: PublicShareButtonViewProps) {
  const { t } = useTranslation();
  const menuItemRef = useRef<"share" | "support">(null);
  const shareId = task?.shareId;
  const isPublicShared = task?.isPublicShared;
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const syncLabel = t(
    syncStatus.error ? "share.sync.failed" : `share.sync.${syncStatus.state}`,
  );
  const hasSyncProblem =
    Boolean(syncStatus.error) || syncStatus.state === "offline";
  const isSyncing = syncStatus.isRequesting || syncStatus.state === "syncing";
  const isSynced = !syncStatus.isLoading && !hasSyncProblem && !isSyncing;
  const SyncIcon =
    syncStatus.state === "offline" ? CloudOffIcon : RefreshCwIcon;

  const doCopy = (content: string) => {
    if (isCopied) return;
    copyToClipboard(content);
    setTimeout(() => {
      onOpenChange(false);
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
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
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
                className="-right-0.5 -bottom-0.5 absolute size-1.5 rounded-full bg-[var(--vscode-notificationsWarningIcon-foreground)]"
              />
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="dropdown-menu animate-in overflow-hidden rounded-md border bg-background p-1 text-popover-foreground shadow"
      >
        <div
          aria-busy={syncStatus.isLoading || isSyncing}
          className="flex min-h-9 items-center gap-2 whitespace-nowrap px-2 py-1"
        >
          <DropdownMenuLabel asChild className="mr-auto p-0">
            <h3>{t("share.title")}</h3>
          </DropdownMenuLabel>
          {syncStatus.isLoading ? (
            <Skeleton
              aria-hidden="true"
              className="h-2 w-8 bg-[var(--vscode-inputOption-hoverBackground)]"
            />
          ) : !isSynced ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  data-testid="sync-status-icon"
                  role="img"
                  aria-label={syncLabel}
                  className="inline-flex shrink-0 text-muted-foreground"
                >
                  {syncStatus.error ? (
                    <NotificationStatusIcon status="failed" />
                  ) : (
                    <SyncIcon
                      aria-hidden="true"
                      className={
                        isSyncing
                          ? "size-3.5 motion-safe:animate-spin"
                          : "size-3.5"
                      }
                    />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{syncLabel}</TooltipContent>
            </Tooltip>
          ) : null}
          {!syncStatus.isLoading && hasSyncProblem && !isSyncing ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void syncStatus.sync().catch(() => {});
              }}
              className="cursor-pointer px-0 py-0 font-medium text-primary text-xs underline-offset-4 hover:underline focus:bg-transparent focus:text-primary focus:underline"
            >
              {t("share.sync.retry")}
            </DropdownMenuItem>
          ) : !syncStatus.isLoading && isSyncing ? (
            <span className="text-muted-foreground text-xs">
              {t("share.sync.syncing")}
            </span>
          ) : null}
        </div>
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
