import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { ModelSelect } from "@/components/model-select";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import {
  type CreateWorktreeType,
  WorktreeSelect,
} from "@/components/worktree-select";
import { useSelectedModels, useSettingsStore } from "@/features/settings";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useTaskInputDraft } from "@/lib/hooks/use-task-input-draft";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { vscodeHost } from "@/lib/vscode";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { Loader2, PaperclipIcon } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatInputForm } from "./chat-input-form";

interface CreateTaskInputProps {
  cwd: string;
  workspacePath: string | null | undefined;
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  userSelectedWorktree: CreateWorktreeType;
  setUserSelectedWorktree: (v: CreateWorktreeType) => void;
  deletingWorktreePaths: Set<string>;
}

const noop = () => {};

export const CreateTaskInput: React.FC<CreateTaskInputProps> = ({
  cwd,
  workspacePath,
  attachmentUpload,
  userSelectedWorktree,
  setUserSelectedWorktree,
  deletingWorktreePaths,
}) => {
  const { t } = useTranslation();
  const { draft: input, setDraft: setInput, clearDraft } = useTaskInputDraft();
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
    clearFiles,
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
  const worktrees = useMemo(() => {
    return worktreesData.worktrees?.filter(
      (x: GitWorktree) => !deletingWorktreePaths.has(x.path),
    );
  }, [worktreesData, deletingWorktreePaths]);

  const isOpenCurrentWorkspace = !!workspacePath && cwd === workspacePath;
  const isOpenMainWorktree =
    isOpenCurrentWorkspace &&
    worktrees?.find((x: GitWorktree) => x.isMain)?.path === cwd;

  const selectedWorktree = useMemo(() => {
    if (isOpenCurrentWorkspace && !isOpenMainWorktree) {
      return worktrees?.find((x: GitWorktree) => x.path === cwd);
    }
    return userSelectedWorktree || worktrees?.[0];
  }, [
    userSelectedWorktree,
    worktrees,
    cwd,
    isOpenCurrentWorkspace,
    isOpenMainWorktree,
  ]);

  const worktreeOptions = useMemo(() => {
    if (isOpenMainWorktree) {
      return worktrees ?? [];
    }
    return (
      worktrees?.filter((x: GitWorktree) => x.path === workspacePath) ?? []
    );
  }, [isOpenMainWorktree, worktrees, workspacePath]);

  const onFocus = () => {
    useSettingsStore.persist.rehydrate();
  };

  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [debouncedIsCreatingTask, setDebouncedIsCreatingTask] =
    useDebounceState(isCreatingTask, 300);

  const handleSubmitImpl = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement>,
      shouldCreateWorktree?: boolean,
    ) => {
      e?.preventDefault();

      if (isCreatingTask) return;

      // Uploading / Compacting is not allowed to be stopped.
      if (isUploadingAttachments) return;

      // If no valid model is selected, submission is not allowed.
      if (!selectedModel) return;

      const content = input.trim();

      // Disallow empty submissions
      if (content.length === 0 && files.length === 0) return;

      // Set isCreatingTask state true
      // Show loading and freeze input
      setIsCreatingTask(true);
      setDebouncedIsCreatingTask(true);

      if (files.length > 0) {
        const uploadedAttachments = await upload();
        const uploadedFiles = uploadedAttachments.map((x) => ({
          contentType: x.mediaType,
          name: x.filename ?? "attachment",
          url: x.url,
        }));

        const worktree =
          shouldCreateWorktree === true || selectedWorktree === "new-worktree"
            ? await vscodeHost.createWorktree({
                generateBranchName: {
                  prompt: content,
                  files: uploadedFiles,
                },
              })
            : selectedWorktree;
        if (worktree) {
          vscodeHost.openTaskInPanel({
            type: "new-task",
            cwd: worktree?.path || cwd,
            prompt: content,
            files: uploadedFiles,
          });
          clearFiles();
          // Clear input content after unfreeze
          setTimeout(clearDraft, 50);
        }
      } else if (content.length > 0) {
        clearUploadError();

        const worktree =
          shouldCreateWorktree || selectedWorktree === "new-worktree"
            ? await vscodeHost.createWorktree({
                generateBranchName: {
                  prompt: content,
                },
              })
            : selectedWorktree;
        if (worktree) {
          vscodeHost.openTaskInPanel({
            type: "new-task",
            cwd: worktree?.path || cwd,
            prompt: content,
          });
          // Clear input content after unfreeze
          setTimeout(clearDraft, 50);
        }
      }

      // Set isCreatingTask state false
      // Hide loading and unfreeze input
      setIsCreatingTask(false);
      setDebouncedIsCreatingTask(false);
    },
    [
      cwd,
      input,
      files,
      upload,
      selectedModel,
      selectedWorktree,
      isCreatingTask,
      isUploadingAttachments,
      clearUploadError,
      clearDraft,
      clearFiles,
      setDebouncedIsCreatingTask,
    ],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      handleSubmitImpl(e);
    },
    [handleSubmitImpl],
  );

  const handleCtrlSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      handleSubmitImpl(e, true);
    },
    [handleSubmitImpl],
  );

  return (
    <>
      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        onCtrlSubmit={handleCtrlSubmit}
        isLoading={isCreatingTask}
        editable={!isCreatingTask}
        onPaste={handlePasteAttachment}
        status="ready"
        onFileDrop={handleFileDrop}
        queuedMessages={[]}
        pendingApproval={undefined}
        isSubTask={false}
        onRemoveQueuedMessage={noop}
        onFocus={onFocus}
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
          {worktreeOptions.length > 0 && (
            <WorktreeSelect
              cwd={cwd}
              worktrees={worktreeOptions}
              isLoading={worktreesData.isLoading}
              showCreateWorktree={isOpenMainWorktree}
              value={selectedWorktree}
              onChange={(v) => {
                setUserSelectedWorktree(v);
              }}
            />
          )}
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
          {!!debouncedIsCreatingTask && (
            <span className="p-1">
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
        </div>
      </div>
    </>
  );
};
