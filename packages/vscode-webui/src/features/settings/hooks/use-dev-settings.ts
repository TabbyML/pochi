import { useReviewPlanTutorialCounter } from "@/lib/hooks/use-review-plan-tutorial-counter";
import { useVSCodeSettings } from "@/lib/hooks/use-vscode-settings";
import { vscodeHost } from "@/lib/vscode";
import { useSettingsStore } from "../store";

export function useDevSettings() {
  const { isDevMode, updateIsDevMode } = useSettingsStore();
  const vscodeSettings = useVSCodeSettings();
  const { resetCount: resetTutorialCount } = useReviewPlanTutorialCounter();

  const resetRecommendSettings = async () => {
    await vscodeHost.updateVSCodeSettings({
      hideRecommendSettings: false,
    });
  };

  const clearOPFSStorage = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear Pochi's local OPFS storage? This action cannot be undone.",
    );
    if (!confirmed) return;

    const opfsRoot = await navigator.storage.getDirectory();
    if ("remove" in opfsRoot && typeof opfsRoot.remove === "function") {
      await opfsRoot.remove();
    }
  };

  return {
    isDevMode,
    setDevMode: updateIsDevMode,
    showResetRecommendBtn: !!vscodeSettings?.hideRecommendSettings,
    resetRecommendSettings,
    clearOPFSStorage,
    resetTutorialCount,
  };
}
