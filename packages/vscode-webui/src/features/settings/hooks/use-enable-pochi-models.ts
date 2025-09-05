import { useSettingsStore } from "../store";

export const useEnablePochiModels = () => {
  const { enablePochiModels } = useSettingsStore();
  return enablePochiModels;
};
