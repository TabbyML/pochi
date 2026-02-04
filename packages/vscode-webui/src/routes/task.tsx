import "@/components/prompt-form/prompt-form.css";

import { GlobalStoreInitializer } from "@/components/global-store-initializer";
import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatPage, ChatSkeleton } from "@/features/chat";
import { useForkTaskStatus } from "@/lib/hooks/use-fork-task-status";
import { useModelList } from "@/lib/hooks/use-model-list";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { DefaultStoreOptionsProvider } from "@/lib/use-default-store";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { z } from "zod";

const searchSchema = z.object({
  uid: z.string(),
  storeId: z.string().optional(),
});

export const Route = createFileRoute("/task")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const searchParams = Route.useSearch();
  let info: typeof window.POCHI_TASK_INFO;
  if (window.POCHI_WEBVIEW_KIND === "pane" && window.POCHI_TASK_INFO) {
    if (searchParams.uid === window.POCHI_TASK_INFO.uid) {
      info = window.POCHI_TASK_INFO;
    } else {
      info = {
        uid: searchParams.uid,
        cwd: window.POCHI_TASK_INFO.cwd,
        type: "open-task",
      };
    }
  }

  if (!info) {
    throw new Error("task params not found");
  }

  const { uid } = searchParams;

  const { users } = useUserStorage();
  const { modelList = [] } = useModelList(true);
  const { jwt, isPending } = usePochiCredentials();

  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
  }

  const key = `task-${uid}`;
  let storeId = encodeStoreId(jwt, uid);
  if (
    (info?.type === "open-task" || info?.type === "fork-task") &&
    info.storeId
  ) {
    storeId = info.storeId;
  } else if (searchParams.storeId) {
    storeId = searchParams.storeId;
  }

  if (isPending) return null;

  const chatPage = (
    <>
      <GlobalStoreInitializer />
      <ChatPage key={key} user={users?.pochi} uid={uid} info={info} />
    </>
  );

  return (
    <Suspense fallback={<ChatSkeleton />}>
      <DefaultStoreOptionsProvider storeId={storeId} jwt={jwt}>
        {info?.type === "fork-task" ? (
          <ForkTaskQueryWrapper uid={uid}>{chatPage}</ForkTaskQueryWrapper>
        ) : (
          chatPage
        )}
      </DefaultStoreOptionsProvider>
    </Suspense>
  );
}

function ForkTaskQueryWrapper({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  // All useStore and queries must run after forkTask status is ready
  const forkTaskStatus = useForkTaskStatus();
  return forkTaskStatus[uid] === "ready" ? children : <ChatSkeleton />;
}
