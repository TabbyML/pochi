import "@/components/prompt-form/prompt-form.css";

import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatPage, ChatSkeleton } from "@/features/chat";
import { useModelList } from "@/lib/hooks/use-model-list";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LiveStoreDefaultProvider } from "../livestore-default-provider";

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
    if (info?.uid !== searchParams.uid) {
      info = window.POCHI_TASK_INFO;
    } else {
      info = {
        uid: searchParams.uid,
        displayId: null,
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
  if (info?.type === "open-task" && info.storeId) {
    storeId = info.storeId;
  } else if (searchParams.storeId) {
    storeId = searchParams.storeId;
  }

  if (isPending) return null;

  return (
    <LiveStoreDefaultProvider
      jwt={jwt}
      storeId={storeId}
      renderLoading={renderLoading}
    >
      <ChatPage key={key} user={users?.pochi} uid={uid} info={info} />
    </LiveStoreDefaultProvider>
  );
}

function renderLoading() {
  return <ChatSkeleton />;
}
