import { useSettingsStore } from "../store";

export function useSubtaskOffhand() {
  const { subtaskOffhand, toggleSubtaskOffhand } = useSettingsStore();
  return {
    subtaskOffhand,
    toggleSubtaskOffhand,
  };
}
