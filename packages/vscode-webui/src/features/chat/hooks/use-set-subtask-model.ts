import { useSelectedModels, useSettingsStore } from "@/features/settings";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { useEffect } from "react";
import { pick } from "remeda";

export const useSetSubtaskModel = ({
  isSubTask,
  customAgentModel,
}: { isSubTask: boolean; customAgentModel?: DisplayModel }) => {
  const { selectedModel: parentTaskModel } = useSelectedModels({
    isSubTask: false,
  });
  const { updateSubtaskSelectedModel } = useSettingsStore();

  useEffect(() => {
    if (!isSubTask) return;

    // use parent task model as fallback
    const subtaskModel = customAgentModel || parentTaskModel;
    if (subtaskModel) {
      updateSubtaskSelectedModel(pick(subtaskModel, ["id", "name"]));
    }
  }, [
    isSubTask,
    customAgentModel,
    parentTaskModel,
    updateSubtaskSelectedModel,
  ]);
};
