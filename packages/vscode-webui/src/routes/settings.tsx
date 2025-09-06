import { SettingsPage } from "@/features/settings";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: () => {
    return <SettingsPage />;
  },
});
