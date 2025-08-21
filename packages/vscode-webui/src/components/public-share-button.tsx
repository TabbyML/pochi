import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { vscodeHost } from "@/lib/vscode";
import { SocialLinks, prompts } from "@getpochi/common";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import {
  CheckIcon,
  CopyIcon,
  MessageSquareShare,
  Share2Icon,
} from "lucide-react";
import { useRef, useState } from "react";

interface PublicShareButtonProps {
  disabled?: boolean;
  shareId: string | undefined | null;
  onError?: (e: Error) => void;
  modelId?: string;
  displayError?: string;
}

export function PublicShareButton({
  disabled,
  shareId,
  modelId,
  displayError,
}: PublicShareButtonProps) {
  const menuItemRef = useRef<"share" | "support">(null);
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
    const environment = await vscodeHost.readEnvironment();
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
    const openDiscordButtonText = "Join Discord";
    const result = await vscodeHost.showInformationMessage(
      "Task shared with the Pochi team",
      {
        modal: true,
        detail: `This task and relevant debug information have been sent. For support, please join our Discord server and reference this issue with the ID: ${shareId}.`,
      },
      openDiscordButtonText,
      "OK",
    );

    if (result === openDiscordButtonText) {
      await vscodeHost.openExternal(SocialLinks.Discord);
    }
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
          onClick={handleCopyLink}
          disabled={!shareId}
          className="cursor-pointer"
        >
          {menuItemRef.current === "share" && isCopied ? (
            <CheckIcon className="mr-2 size-4 text-success" />
          ) : (
            <CopyIcon className="mr-2 size-4" />
          )}
          Copy link
          {!shareId && (
            <span className="ml-2 text-muted-foreground text-xs">
              (Share first)
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
          Share with Support
          {!shareId && (
            <span className="ml-2 text-muted-foreground text-xs">
              (Share first)
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
