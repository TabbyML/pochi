import { useSelectedModels } from "@/features/settings";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import type { ValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { useEffect } from "react";

export const useSetSubtaskModel = ({
  isSubTask,
  customAgent,
  model,
}: {
  isSubTask: boolean;
  customAgent?: ValidCustomAgentFile;
  model?: string;
}) => {
  const { customAgentModel } = useCustomAgent(customAgent?.name, model);
  const { updateSelectedModelId } = useSelectedModels({
    isSubTask,
    modelOverride: customAgentModel,
  });

  useEffect(() => {
    if (!isSubTask) return;

    if (customAgentModel) {
      updateSelectedModelId(customAgentModel.id);
    }
  }, [isSubTask, customAgentModel, updateSelectedModelId]);
};
