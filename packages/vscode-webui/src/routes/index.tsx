import { ChatPage } from "@/features/chat";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import "@/components/prompt-form/prompt-form.css";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useModelList } from "@/lib/hooks/use-model-list";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { useEffect } from "react";
import { useStoreDate } from "../livestore-provider";

// Corresponds to the FileUIPart type in the ai/react library
const fileUIPartSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  url: z.string(),
});

const searchSchema = z.object({
  uid: z.string().catch(() => crypto.randomUUID()),
  storeDate: z.number().optional(),
  prompt: z.string().optional(),
  files: z.array(fileUIPartSchema).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { uid, prompt, files, storeDate } = Route.useSearch();
  const uiFiles = files?.map((file) => ({
    type: "file" as const,
    filename: file.name,
    mediaType: file.contentType,
    url: file.url,
  }));

  const { users } = useUserStorage();
  const { modelList = [] } = useModelList(true);

  const { setStoreDate } = useStoreDate();
  useEffect(() => {
    if (storeDate) {
      setStoreDate(new Date(storeDate));
    }
  }, [storeDate, setStoreDate]);

  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
  }

  const key = `task-${uid}`;

  return (
    <ChatPage
      key={key}
      user={users?.pochi}
      uid={uid}
      prompt={prompt}
      files={uiFiles}
    />
  );
}
