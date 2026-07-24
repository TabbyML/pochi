import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { ModelSelect } from "@/components/model-select";
import { TodoModeBadge } from "@/components/prompt-form/todo-mode-badge";
import { SubmitDropdownButton } from "@/components/submit-dropdown-button";
import {
  type CreateWorktreeType,
  WorktreeSelect,
} from "@/components/worktree-select";
import {
  useIsDevMode,
  useSelectedModels,
  useSettingsStore,
} from "@/features/settings";
import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useMcpConfigOverride } from "@/lib/hooks/use-mcp-config-override";
import { useTaskInputDraft } from "@/lib/hooks/use-task-input-draft";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import type { GitWorktree, Review } from "@getpochi/common/vscode-webui-bridge";
import { type Todo, initTodoModeTodos } from "@getpochi/tools";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInputForm, type ChatInputFormHandle } from "./chat-input-form";

interface CreateTaskInputProps {
  cwd: string;
  workspacePath: string | null | undefined;
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  userSelectedWorktree: CreateWorktreeType;
  setUserSelectedWorktree: (v: CreateWorktreeType) => void;
  deletingWorktreePaths: Set<string>;
}

const emptyReviews: Review[] = [];

export const CreateTaskInput: React.FC<CreateTaskInputProps> = ({
  cwd,
  workspacePath,
  attachmentUpload,
  userSelectedWorktree,
  setUserSelectedWorktree,
  deletingWorktreePaths,
}) => {
  const activeSelection = useActiveSelection();
  const { draft: input, setDraft: setInput, clearDraft } = useTaskInputDraft();
  const [planMode, setPlanMode] = useState(false);
  const [todoModeSelected, setTodoModeSelected] = useState(false);
  const [isDevMode] = useIsDevMode();
  const canUseTodoMode = isDevMode === true;
  const todoMode = canUseTodoMode && todoModeSelected;
  const togglePlanMode = useCallback(() => {
    setPlanMode((enabled) => {
      const nextEnabled = !enabled;
      if (nextEnabled) {
        setTodoModeSelected(false);
      }
      return nextEnabled;
    });
  }, []);
  const switchSubmitMode = useCallback(() => {
    setTodoModeSelected(false);
    setPlanMode((enabled) => !enabled);
  }, []);
  const selectTodoMode = useCallback(() => {
    if (!canUseTodoMode) return;
    setPlanMode(false);
    setTodoModeSelected(true);
  }, [canUseTodoMode]);
  const {
    globalMcpConfig,
    mcpConfigOverride,
    toggleServer,
    reset: resetMcpTools,
  } = useMcpConfigOverride();
  const {
    groupedModels,
    selectedModel,
    selectedModelFromStore, // for fallback display
    isLoading: isModelsLoading,
    isFetching: isFetchingModels,
    reload: reloadModels,
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

  const chatInputFormRef = useRef<ChatInputFormHandle>(null);

  const onFocus = () => {
    useSettingsStore.persist.rehydrate();
  };

  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [debouncedIsCreatingTask, setDebouncedIsCreatingTask] =
    useDebounceState(isCreatingTask, 300);

  const [baseBranch, setBaseBranch] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (baseBranch) {
      return;
    }
    if (!isOpenMainWorktree) {
      setBaseBranch(undefined);
    } else {
      setBaseBranch(worktreesData.worktrees?.find((x) => x.isMain)?.branch);
    }
  }, [baseBranch, isOpenMainWorktree, worktreesData.worktrees]);

  const createWorktreeAndOpenTask = useCallback(
    async (params: {
      content: string;
      shouldCreateWorktree: boolean;
      uploadedFiles?: Array<{
        contentType: string;
        name: string;
        url: string;
      }>;
      todos?: Todo[];
    }): Promise<boolean> => {
      const { content, shouldCreateWorktree, uploadedFiles, todos } = params;

      let worktree: typeof selectedWorktree | null = selectedWorktree;
      if (shouldCreateWorktree) {
        worktree = await vscodeHost.createWorktree({
          baseBranch: baseBranch || undefined,
          generateBranchName: {
            prompt: content,
            files: uploadedFiles,
          },
        });

        // If worktree creation was requested but failed, do not proceed
        if (!worktree) {
          return false;
        }
      }

      // Terminal selection can only be read on demand (there's no reactive
      // VS Code API for it), so capture it once at task-creation time.
      const activeTerminalTextSelection = isVSCodeEnvironment()
        ? await vscodeHost.readTerminalSelection()
        : undefined;

      vscodeHost.openTaskInPanel(
        {
          type: "new-task",
          cwd: worktree && typeof worktree === "object" ? worktree.path : cwd,
          prompt: content,
          todos,
          files: uploadedFiles,
          activeSelection: activeSelection ?? undefined,
          activeTerminalTextSelection,
          mcpConfigOverride:
            Object.keys(mcpConfigOverride).length > 0
              ? mcpConfigOverride
              : globalMcpConfig,
        },
        { preview: false },
      );

      // Clear files if they were uploaded
      if (uploadedFiles && uploadedFiles.length > 0) {
        clearFiles();
      }

      resetMcpTools();
      // Clear input content after unfreeze
      setTimeout(clearDraft, 50);

      return true;
    },
    [
      cwd,
      selectedWorktree,
      baseBranch,
      clearFiles,
      clearDraft,
      mcpConfigOverride,
      resetMcpTools,
      globalMcpConfig,
      activeSelection,
    ],
  );

  const handleSubmitImpl = useCallback(
    async (options?: {
      shouldCreateWorktree?: boolean;
      shouldCreatePlan?: boolean;
      shouldCreateTodo?: boolean;
    }) => {
      const { shouldCreateWorktree } = options || {};
      const shouldCreatePlan = options?.shouldCreatePlan ?? planMode;
      const shouldCreateTodo =
        canUseTodoMode && (options?.shouldCreateTodo ?? todoMode);

      if (isCreatingTask) return;

      // Uploading / Compacting is not allowed to be stopped.
      if (isUploadingAttachments) return;

      // If no valid model is selected, submission is not allowed.
      if (!selectedModel) return;

      let content = input.text.trim();

      // Disallow empty submissions
      if (content.length === 0 && files.length === 0) return;

      if (shouldCreatePlan) {
        // Use built-in planner agent
        content = `${prompts.customAgent("planner")} ${content}`;
      }

      // Set isCreatingTask state true
      // Show loading and freeze input
      setIsCreatingTask(true);
      setDebouncedIsCreatingTask(true);

      // Upload files if present
      let uploadedFiles: Array<{
        contentType: string;
        name: string;
        url: string;
      }> = [];

      if (files.length > 0) {
        const uploadedAttachments = await upload();
        uploadedFiles = uploadedAttachments.map((x) => ({
          contentType: x.mediaType,
          name: x.filename ?? "attachment",
          url: x.url,
        }));
      } else {
        clearUploadError();
      }

      // Create worktree and open task
      await createWorktreeAndOpenTask({
        content,
        shouldCreateWorktree:
          shouldCreateWorktree === true || selectedWorktree === "new-worktree",
        uploadedFiles: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        todos: shouldCreateTodo ? initTodoModeTodos(content) : undefined,
      });

      // Set isCreatingTask state false
      // Hide loading and unfreeze input
      setIsCreatingTask(false);
      setDebouncedIsCreatingTask(false);
      // Reset submit mode after each submission
      setPlanMode(false);
      setTodoModeSelected(false);
    },
    [
      input.text,
      files,
      upload,
      selectedModel,
      selectedWorktree,
      isCreatingTask,
      isUploadingAttachments,
      clearUploadError,
      setDebouncedIsCreatingTask,
      createWorktreeAndOpenTask,
      planMode,
      todoMode,
      canUseTodoMode,
    ],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSubmitImpl();
    },
    [handleSubmitImpl],
  );

  const handleCtrlSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSubmitImpl({ shouldCreateWorktree: true });
    },
    [handleSubmitImpl],
  );

  const handleClickSubmit = useCallback(
    async (shouldCreatePlan?: boolean) => {
      chatInputFormRef.current?.addToSubmitHistory();
      handleSubmitImpl({
        shouldCreatePlan: !!shouldCreatePlan,
      });
    },
    [handleSubmitImpl],
  );

  return (
    <>
      <ChatInputForm
        ref={chatInputFormRef}
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        onCtrlSubmit={handleCtrlSubmit}
        isLoading={isCreatingTask}
        editable={!isCreatingTask}
        onPaste={handlePasteAttachment}
        status="ready"
        onFileDrop={handleFileDrop}
        pendingApproval={undefined}
        isSubTask={false}
        onFocus={onFocus}
        reviews={emptyReviews}
        onSwitchSubmitMode={switchSubmitMode}
        isPlanMode={planMode}
        onSelectTodoMode={canUseTodoMode ? selectTodoMode : undefined}
        onAttachFile={() => fileInputRef.current?.click()}
        contextMenuSide="bottom"
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
        <div className="flex items-center gap-2 overflow-x-hidden truncate">
          <ModelSelect
            value={selectedModel || selectedModelFromStore}
            models={groupedModels}
            isLoading={isModelsLoading}
            isFetching={isFetchingModels}
            isValid={!!selectedModel}
            onChange={updateSelectedModelId}
            reloadModels={reloadModels}
            triggerClassName="sidebar-model-select"
          />
          {todoMode && (
            <TodoModeBadge onRemove={() => setTodoModeSelected(false)} />
          )}
        </div>

        <div className="mr-1 flex shrink-0 items-center gap-0.5">
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
              baseBranch={baseBranch}
              onBaseBranchChange={setBaseBranch}
            />
          )}
          <SubmitDropdownButton
            isLoading={debouncedIsCreatingTask}
            disabled={!selectedModel || isUploadingAttachments}
            onSubmit={() => handleClickSubmit()}
            onSubmitPlan={() => handleClickSubmit(true)}
            mcpConfigOverride={mcpConfigOverride}
            onToggleServer={toggleServer}
            resetMcpTools={resetMcpTools}
            isPlanMode={planMode}
            onTogglePlanMode={togglePlanMode}
            onSwitchSubmitMode={switchSubmitMode}
          />
        </div>
      </div>
    </>
  );
};
