import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { ModelSelect } from "@/components/model-select";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { WorktreeSelect } from "@/components/worktree-select";
import { useSelectedModels } from "@/features/settings";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { vscodeHost } from "@/lib/vscode";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { PaperclipIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatInputForm } from "./chat-input-form";

interface CreateTaskInputProps {
  cwd: string;
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
}

const noop = () => {};

export const CreateTaskInput: React.FC<CreateTaskInputProps> = ({
  cwd,
  attachmentUpload,
}) => {
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
  const [userSelect, setUserSelect] = useState<GitWorktree | undefined>();
  const selectedWorktree = userSelect || worktreesData.data?.[0];
  useEffect(() => {
    if (userSelect) {
      setUserSelect(
        worktreesData.data?.find(
          (worktree) => worktree.path === userSelect.path,
        ),
      );
    }
  }, [worktreesData.data, userSelect]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      // Uploading / Compacting is not allowed to be stopped.
      if (isUploadingAttachments) return;

      const content = input.trim();

      // Disallow empty submissions
      if (content.length === 0 && files.length === 0) return;

      if (files.length > 0) {
        const uploadedAttachments = await upload();
        vscodeHost.openTaskInPanel({
          cwd: selectedWorktree?.path || cwd,
          uid: crypto.randomUUID(),
          storeId: undefined,
          prompt: content,
          files: uploadedAttachments.map((x) => ({
            contentType: x.mediaType,
            name: x.filename ?? "attachment",
            url: x.url,
          })),
        });

        setInput("");
      } else if (content.length > 0) {
        clearUploadError();
        vscodeHost.openTaskInPanel({
          cwd: selectedWorktree?.path || cwd,
          uid: crypto.randomUUID(),
          storeId: undefined,
          prompt: content,
        });

        setInput("");
      }
    },
    [
      files.length,
      input,
      clearUploadError,
      isUploadingAttachments,
      upload,
      selectedWorktree?.path,
      cwd,
    ],
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
        </div>

        <div className="mr-1 flex shrink-0 items-center gap-1">
          <WorktreeSelect
            cwd={cwd}
            worktrees={worktreesData.data ?? []}
            isLoading={worktreesData.isLoading}
            value={selectedWorktree}
            onChange={(v) => {
              setUserSelect(v);
            }}
          />
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
        </div>
      </div>
    </>
  );
};
