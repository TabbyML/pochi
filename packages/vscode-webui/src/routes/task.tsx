import "@/components/prompt-form/prompt-form.css";
import { ChatPage, SubtaskPage } from "@/features/chat";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { createFileRoute } from "@tanstack/react-router";
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
  const { uid } = Route.useSearch();
  const { users } = useUserStorage();
  const panelInfo = window.POCHI_PANEL_INFO;
  if (window.POCHI_WEBVIEW_KIND !== "pane" || panelInfo?.type !== "task") {
    throw new Error("task params not found");
  }

  const rootTask = panelInfo.payload.task;
  return uid === rootTask.uid ? (
    <ChatPage key={uid} uid={uid} info={rootTask} user={users?.pochi} />
  ) : (
    <SubtaskPage key={uid} uid={uid} cwd={rootTask.cwd} />
  );
}
