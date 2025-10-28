import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { vscodeHost } from "@/lib/vscode";
import { SocialLinks, prompts } from "@getpochi/common";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  CheckIcon,
  CopyIcon,
  MessageSquareShare,
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
    });
    const shareUrl = `${getServerBaseUrl()}/share/${shareId}`;

    const environmentInfo = prompts.environment(environment, undefined);
    const supportInfo = `Support Information
=================

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
        >
          <Share2Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
