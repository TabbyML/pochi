import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { ModelSelect } from "@/components/model-select";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WorktreeSelect } from "@/components/worktree-select";
import { useSelectedModels } from "@/features/settings";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { prepareMessageParts } from "@/lib/message-utils";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import {
  GitFork,
  PaperclipIcon,
  SendHorizonal,
  StopCircleIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatInputForm } from "./chat-input-form";

interface Props {
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
}

const noop = () => {};

export const NewTaskInputBox: React.FC<Props> = ({ attachmentUpload }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");

  const {
    groupedModels,
    selectedModel,
    selectedModelFromStore, // for fallback display
    isLoading: isModelsLoading,
    updateSelectedModelId,
  } = useSelectedModels({ isSubTask: false });

  // Use the unified attachment upload hook
  const {
    files,
    upload,
    isUploading: isUploadingAttachments,
    fileInputRef,
    removeFile,
    handleFileSelect,
    handlePaste: handlePasteAttachment,
    handleFileDrop,
    clearError: clearUploadError,
  } = attachmentUpload;

  const worktreesData = useWorktrees();
  const [isLaunchInWorktree, setIsLaunchInWorktree] = useState(false);
  const [selectedWorktree, setSelectedWorktree] = useState<GitWorktree>();

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      // Uploading / Compacting is not allowed to be stopped.
      if (isUploadingAttachments) return;

      const content = input.trim();
      const text = content;

      // Disallow empty submissions
      if (text.length === 0 && files.length === 0) return;

      if (files.length > 0) {
        try {
          const uploadedAttachments = await upload();
          const parts = prepareMessageParts(t, text, uploadedAttachments);

          // await sendMessage({
          //   parts,
          // });
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (content.length > 0) {
        clearUploadError();
        const parts = prepareMessageParts(t, text, []);
        // await sendMessage({
        //   parts,
        // });
      }
    },
    [files.length, input, upload, clearUploadError, isUploadingAttachments, t],
  );

  return (
    <>
      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        isLoading={false}
        onPaste={handlePasteAttachment}
        status="ready"
        onFileDrop={handleFileDrop}
        queuedMessages={[]}
        pendingApproval={undefined}
        isSubTask={false}
        onQueueMessage={noop}
        onRemoveQueuedMessage={noop}
      >
        {files.length > 0 && (
          <div className="px-3">
            <AttachmentPreviewList
              files={files}
              onRemove={removeFile}
              isUploading={isUploadingAttachments}
            />
          </div>
        )}
      </ChatInputForm>

      {/* Hidden file input for image uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,application/pdf,video/*"
        multiple
        className="hidden"
      />

      <div className="my-2 flex shrink-0 justify-between gap-5 overflow-x-hidden">
        <div className="flex items-center gap-4 overflow-x-hidden truncate">
          <ModelSelect
            value={selectedModel || selectedModelFromStore}
            models={groupedModels}
            isLoading={isModelsLoading}
            isValid={!!selectedModel}
            onChange={updateSelectedModelId}
          />
          <div className="flex items-center gap-1 overflow-x-hidden truncate">
            <HoverCard>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-1">
                  <Switch
                    id="worktree-switch"
                    checked={isLaunchInWorktree}
                    onCheckedChange={setIsLaunchInWorktree}
                  />
                  <Label htmlFor="worktree-switch" className="cursor-pointer">
                    <GitFork className="size-4" />
                  </Label>
                </div>
              </HoverCardTrigger>
              <HoverCardContent
                side="top"
                align="center"
                sideOffset={6}
                className="!w-auto max-w-sm bg-background px-3 py-1.5 text-xs"
              >
                {t("chat.createTaskInWorktree")}
              </HoverCardContent>
            </HoverCard>
            {isLaunchInWorktree && (
              <WorktreeSelect
                worktrees={worktreesData.data ?? []}
                isLoading={worktreesData.isLoading}
                value={selectedWorktree}
                onChange={(v) => {
                  const selected = worktreesData.data?.find(
                    (w) => w.path === v,
                  );
                  setSelectedWorktree(selected);
                }}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <HoverCard>
            <HoverCardTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="button-focus relative h-6 w-6 p-0"
                >
                  <span className="size-4">
                    <PaperclipIcon className="size-4 translate-y-[1.5px] scale-105" />
                  </span>
                </Button>
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="start"
              sideOffset={6}
              className="!w-auto max-w-sm bg-background px-3 py-1.5 text-xs"
            >
              {t("chat.attachmentTooltip")}
            </HoverCardContent>
          </HoverCard>
          <SubmitStopButton
            isSubmitDisabled={isUploadingAttachments || isModelsLoading}
            showStopButton={false}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  );
};

interface SubmitStopButtonProps {
  isSubmitDisabled: boolean;
  showStopButton: boolean;
  onSubmit: () => void;
}

const SubmitStopButton: React.FC<SubmitStopButtonProps> = ({
  isSubmitDisabled,
  showStopButton,
  onSubmit,
}) => {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isSubmitDisabled}
      className="button-focus h-6 w-6 p-0"
      onClick={() => {
        onSubmit();
      }}
    >
      {showStopButton ? (
        <StopCircleIcon className="size-4" />
      ) : (
        <SendHorizonal className="size-4" />
      )}
    </Button>
  );
};
