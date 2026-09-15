import { useNavigate } from "@/lib/hooks/use-navigate";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { useDefaultStore } from "@/lib/use-default-store";
import { getSubAgentBackgroundJobId } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { FixedStateChatContextProvider } from "../lib/chat-state/fixed-state";
import { ChatPage } from "../page";
import { BackgroundTaskDetail } from "./background-task-debug-panel";
import { ChatSkeleton } from "./chat-skeleton";

/** Background tasks have an independent executor; their page only observes. */
export function SubtaskPage({ uid, cwd }: { uid: string; cwd: string }) {
  const store = useDefaultStore();
  const navigate = useNavigate();
  const { users } = useUserStorage();
  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  if (!task) return <ChatSkeleton />;
  if (!task.parentId) throw new Error("Task does not belong to this panel.");
  const parentId = task.parentId;

  if (task.background) {
    return (
      <div className="flex h-screen flex-col">
        <FixedStateChatContextProvider>
          <BackgroundTaskDetail
            taskId={uid}
            backgroundJobId={getSubAgentBackgroundJobId(uid)}
            showDiagnostics={false}
            onBack={() =>
              navigate({
                to: "/task",
                search: { uid: parentId, storeId: store.storeId },
                replace: true,
              })
            }
          />
        </FixedStateChatContextProvider>
      </div>
    );
  }

  return (
    <ChatPage
      uid={uid}
      info={{ type: "open-task", uid, cwd }}
      user={users?.pochi}
    />
  );
}
