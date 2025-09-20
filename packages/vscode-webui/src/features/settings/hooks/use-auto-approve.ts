import { useSettingsStore } from "../store";

export function useAutoApprove({
  autoApproveGuard,
  isSubTask,
}: { autoApproveGuard?: boolean; isSubTask: boolean }) {
  const {
    autoApproveActive,
    autoApproveSettings,
    subtaskAutoApproveActive,
    subtaskAutoApproveSettings,
    updateAutoApproveActive,
    updateAutoApproveSettings,
    updateSubtaskAutoApproveActive,
    updateSubtaskAutoApproveSettings,
  } = useSettingsStore();
  return {
    autoApproveActive:
      (isSubTask ? subtaskAutoApproveActive : autoApproveActive) &&
      (autoApproveGuard ?? true),
    autoApproveSettings: isSubTask
      ? subtaskAutoApproveSettings
      : autoApproveSettings,
    updateAutoApproveActive: isSubTask
      ? updateSubtaskAutoApproveActive
      : updateAutoApproveActive,
    updateAutoApproveSettings: isSubTask
      ? updateSubtaskAutoApproveSettings
      : updateAutoApproveSettings,
  };
}
