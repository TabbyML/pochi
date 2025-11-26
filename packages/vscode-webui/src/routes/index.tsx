import { ScrollArea } from "@/components/ui/scroll-area";
import { WelcomeScreen } from "@/components/welcome-screen";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { WorktreeList } from "@/components/worktree-list";
import { CreateTaskInput } from "@/features/chat";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useModelList } from "@/lib/hooks/use-model-list";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { setActiveStore } from "@/lib/vscode";
import { taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { createFileRoute } from "@tanstack/react-router";
import { TerminalIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const workspaceFolder = currentWorkspace?.workspaceFolder;
  // Fetch all tasks
  const tasks = store.useQuery(taskCatalog.queries.makeTasksQuery(cwd));

  useEffect(() => {
    setActiveStore(store);
    return () => {
      setActiveStore(null);
    };
  }, [store]);

  const attachmentUpload = useAttachmentUpload();
  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="w-full px-4 pt-3">
        <CreateTaskInput
          cwd={cwd}
          workspaceFolder={workspaceFolder}
          attachmentUpload={attachmentUpload}
        />
      </div>
      {tasks.length === 0 ? (
        <EmptyTaskPlaceholder />
      ) : (
        <div className="min-h-0 flex-1 pt-4">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4 pb-6">
              <WorktreeList
                tasks={[...tasks]}
                cwd={cwd}
                workspaceFolder={workspaceFolder || undefined}
              />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function EmptyTaskPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full select-none flex-col items-center justify-center p-5 text-center text-gray-500 dark:text-gray-300">
      <h2 className="mb-2 flex items-center gap-3 font-semibold text-2xl text-gray-700 dark:text-gray-100">
        <TerminalIcon />
        {t("tasksPage.emptyState.title")}
      </h2>
      <p className="mb-4 leading-relaxed">
        {t("tasksPage.emptyState.description")}
      </p>
    </div>
  );
}
