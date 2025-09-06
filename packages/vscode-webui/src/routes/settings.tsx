import { SettingsPage } from "@/features/settings";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: () => {
    const { users } = useUserStorage();
    return <SettingsPage user={users?.pochi} />;
  },
});
