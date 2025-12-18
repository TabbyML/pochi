import "@/components/prompt-form/prompt-form.css";

import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatPage } from "@/features/chat";
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
  let params: typeof window.POCHI_TASK_PARAMS;
  if (window.POCHI_WEBVIEW_KIND === "pane" && window.POCHI_TASK_PARAMS) {
    if (params?.uid !== searchParams.uid) {
      params = window.POCHI_TASK_PARAMS;
    } else {
      params = {
        uid: searchParams.uid,
        displayId: null,
        cwd: window.POCHI_TASK_PARAMS.params.cwd,
        params: {
          cwd: window.POCHI_TASK_PARAMS.params.cwd,
          type: "open-task",
          uid: searchParams.uid,
          displayId: null,
        },
      };
    }
  }

  if (!params) {
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
  if (params?.params.type === "open-task" && params.params.storeId) {
    storeId = params.params.storeId;
  } else if (searchParams.storeId) {
    storeId = searchParams.storeId;
  }

  if (isPending) return null;

  return (
    <LiveStoreDefaultProvider jwt={jwt} storeId={storeId}>
      <ChatPage key={key} user={users?.pochi} uid={uid} info={params} />
    </LiveStoreDefaultProvider>
  );
}
