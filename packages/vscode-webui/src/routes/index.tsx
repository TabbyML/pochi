import { ScrollArea } from "@/components/ui/scroll-area";
import { WelcomeScreen } from "@/components/welcome-screen";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { WorktreeList } from "@/components/worktree-list";
import type { CreateWorktreeType } from "@/components/worktree-select";
import { CreateTaskInput } from "@/features/chat";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useModelList } from "@/lib/hooks/use-model-list";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { useOptimisticWorktreeDelete } from "@/lib/hooks/use-worktrees";
import { setActiveStore } from "@/lib/vscode";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { useStore } from "@livestore/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LiveStoreTaskProvider } from "../livestore-task-provider";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    return {
      page: Number(search.page ?? 1),
    };
  },
  component: App,
});

function App() {
  const { data: currentWorkspace, isFetching: isFetchingWorkspace } =
    useCurrentWorkspace();

  const { users, isLoading: isUserLoading } = useUserStorage();
  const { modelList = [], isLoading: isModelListLoading } = useModelList(true);

  if (isFetchingWorkspace || isUserLoading || isModelListLoading) {
    return null;
  }

  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
  }

  if (!currentWorkspace?.cwd) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <WorkspaceRequiredPlaceholder isFetching={isFetchingWorkspace} />
      </div>
    );
  }

  return (
    <LiveStoreTaskProvider cwd={currentWorkspace.cwd}>
      <Tasks />
    </LiveStoreTaskProvider>
  );
}

function Tasks() {
  const { store } = useStore();
  const { data: currentWorkspace } = useCurrentWorkspace();
  const cwd = currentWorkspace?.cwd || "default";
  const workspacePath = currentWorkspace?.workspacePath;

  useEffect(() => {
    setActiveStore(store);
    return () => {
      setActiveStore(null);
    };
  }, [store]);

  const attachmentUpload = useAttachmentUpload();

  const [userSelectedWorktree, setUserSelectedWorktree] =
    useState<CreateWorktreeType>();

  const { deleteWorktree, deletingWorktreePaths } =
    useOptimisticWorktreeDelete();

  const onDeleteWorktree = (wt: string) => {
    deleteWorktree(wt);
    if (
      typeof userSelectedWorktree !== "string" &&
      userSelectedWorktree?.path === wt
    ) {
      setUserSelectedWorktree(undefined);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="w-full px-4 pt-3">
        <CreateTaskInput
          cwd={cwd}
          workspacePath={workspacePath}
          attachmentUpload={attachmentUpload}
          userSelectedWorktree={userSelectedWorktree}
          setUserSelectedWorktree={setUserSelectedWorktree}
          deletingWorktreePaths={deletingWorktreePaths}
        />
      </div>
      <div className="min-h-0 flex-1 pt-4">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 px-4 pb-6">
            <WorktreeList
              cwd={cwd}
              deletingWorktreePaths={deletingWorktreePaths}
              onDeleteWorktree={onDeleteWorktree}
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
