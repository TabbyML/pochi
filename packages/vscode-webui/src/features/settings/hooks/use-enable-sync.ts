import { useSettingsStore } from "../store";

export const useEnableSync = () => {
  return useSettingsStore((x) => x.enableSync);
};
