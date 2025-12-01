import "@/components/prompt-form/prompt-form.css";

import { WelcomeScreen } from "@/components/welcome-screen";
import { ChatPage } from "@/features/chat";
import { useModelList } from "@/lib/hooks/use-model-list";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Message } from "@getpochi/livekit";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LiveStoreDefaultProvider } from "../livestore-default-provider";

// Corresponds to the FileUIPart type in the ai/react library
const fileUIPartSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  url: z.string(),
});

const searchSchema = z.object({
  uid: z.string().catch(() => crypto.randomUUID()),
  storeId: z.string().optional(),
  prompt: z.string().optional(),
  files: z.array(fileUIPartSchema).optional(),
  initMessages: z
    .string()
    .optional()
    .describe("JSON string containing an array of messages"),
  disableAutoStart: z.boolean().optional(),
});

export const Route = createFileRoute("/task")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { uid, prompt, files, storeId, initMessages, disableAutoStart } =
    Route.useSearch();
  const uiFiles = files?.map((file) => ({
    type: "file" as const,
    filename: file.name,
    mediaType: file.contentType,
    url: file.url,
  }));

  let parsedInitMessages: Message[] | undefined = undefined;
  if (initMessages) {
    try {
      parsedInitMessages = JSON.parse(initMessages) as Message[];
    } catch (e) {
      // ignore json error
    }
  }

  const { users } = useUserStorage();
  const { modelList = [] } = useModelList(true);
  const { jwt, isPending } = usePochiCredentials();

  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
  }

  const key = `task-${uid}`;
  const computedStoreId = storeId || encodeStoreId(jwt, uid);

  if (isPending) return null;

  return (
    <LiveStoreDefaultProvider jwt={jwt} storeId={computedStoreId}>
      <ChatPage
        key={key}
        user={users?.pochi}
        uid={uid}
        prompt={prompt}
        files={uiFiles}
        initMessages={parsedInitMessages}
        disableAutoStart={disableAutoStart}
      />
    </LiveStoreDefaultProvider>
  );
}
