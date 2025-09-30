import { useSelectedModels, useSettingsStore } from "@/features/settings";
import { useCustomAgentModel } from "@/lib/hooks/use-custom-agents";
import type { ValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { useEffect } from "react";

export const useSetSubtaskModel = ({
  isSubTask,
  customAgent,
}: { isSubTask: boolean; customAgent?: ValidCustomAgentFile }) => {
  const { selectedModel: parentTaskModel } = useSelectedModels({
    isSubTask: false,
  });
  const customAgentModel = useCustomAgentModel(customAgent);
  const { updateSubtaskAutoApproveSettings } = useSettingsStore();

  useEffect(() => {
    if (!isSubTask) return;

    // use parent task model as fallback
    const subtaskModel = customAgentModel || parentTaskModel;
    if (subtaskModel) {
      updateSubtaskAutoApproveSettings({
        modelId: subtaskModel.id,
      });
    }
  }, [
    isSubTask,
    customAgentModel,
    parentTaskModel,
    updateSubtaskAutoApproveSettings,
  ]);
};
