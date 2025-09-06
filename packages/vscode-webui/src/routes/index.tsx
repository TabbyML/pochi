import { ChatPage } from "@/features/chat";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import "@/components/prompt-form/prompt-form.css";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useModelList } from "@/lib/hooks/use-model-list";

const searchSchema = z.object({
  uid: z.string(),
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { uid, prompt } = Route.useSearch();

  const { auth } = Route.useRouteContext();
  const { modelList = [] } = useModelList(true);

  if (!auth?.user && modelList.length === 0) {
    return <WelcomeScreen user={auth?.user} />;
  }

  const key = `task-${uid}`;
  return <ChatPage key={key} user={auth?.user} uid={uid} prompt={prompt} />;
}
