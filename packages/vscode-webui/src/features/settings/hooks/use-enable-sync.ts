import { useSettingsStore } from "../store";

export const useEnableSync = () => {
  const { enableSync } = useSettingsStore();
  return enableSync;
};
