import { ChatPage } from "@/features/chat";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import "@/components/prompt-form/prompt-form.css";
import { WelcomeScreen } from "@/components/welcome-screen";
import { useCustomModelSetting } from "@/lib/hooks/use-custom-model-setting";
import { Loader2 } from "lucide-react";

const searchSchema = z.object({
  uid: z.string().optional(),
  prompt: z.string().optional(),
  ts: z.number().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => searchSchema.parse(search),
  component: RouteComponent,
});

/** @useSignals */
function RouteComponent() {
  const { uid: uidFromRoute, prompt, ts = Date.now() } = Route.useSearch();
  const key = uidFromRoute !== undefined ? `task-${uidFromRoute}` : `new-${ts}`;

  const { auth } = Route.useRouteContext();
  const { customModelSettings, isLoading: isLoadingCustomModelSettings } =
    useCustomModelSetting();
  const uid = uidFromRoute || crypto.randomUUID();

  if (isLoadingCustomModelSettings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!auth?.user && !customModelSettings?.length) {
    return <WelcomeScreen user={auth?.user} />;
  }

  return <ChatPage key={key} user={auth?.user} uid={uid} prompt={prompt} />;
}
