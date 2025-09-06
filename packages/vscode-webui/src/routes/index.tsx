import { ChatPage } from "@/features/chat";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import "@/components/prompt-form/prompt-form.css";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useModelList } from "@/lib/hooks/use-model-list";

const searchSchema = z.object({
  uid: z.string().optional(),
  prompt: z.string().optional(),
  ts: z.number().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { uid: uidFromRoute, prompt, ts = Date.now() } = Route.useSearch();
  const key = uidFromRoute !== undefined ? `task-${uidFromRoute}` : `new-${ts}`;

  const { auth } = Route.useRouteContext();
  const uid = uidFromRoute || crypto.randomUUID();
  const { modelList = [] } = useModelList(true);

  if (!auth?.user && modelList.length === 0) {
    return <WelcomeScreen user={auth?.user} />;
  }

  return <ChatPage key={key} user={auth?.user} uid={uid} prompt={prompt} />;
}
