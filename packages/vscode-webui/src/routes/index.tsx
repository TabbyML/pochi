import { ChatPage } from "@/features/chat";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import "@/components/prompt-form/prompt-form.css";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useModelList } from "@/lib/hooks/use-model-list";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { useEffect } from "react";
import { useStoreDate } from "../livestore-provider";

const searchSchema = z.object({
  uid: z.string().catch(() => crypto.randomUUID()),
  storeDate: z.number().optional(),
  prompt: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { uid, prompt, storeDate } = Route.useSearch();

  const { users } = useUserStorage();
  const { modelList = [] } = useModelList(true);

  const { setStoreDate } = useStoreDate();
  useEffect(() => {
    setStoreDate(storeDate ? new Date(storeDate) : new Date());
  }, [storeDate, setStoreDate]);

  console.log("users", users, modelList);
  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
  }

  const key = `task-${uid}`;

  return <ChatPage key={key} user={users?.pochi} uid={uid} prompt={prompt} />;
}
