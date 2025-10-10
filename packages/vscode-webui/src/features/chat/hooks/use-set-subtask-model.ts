import { useSelectedModels } from "@/features/settings";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import type { ValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { useEffect } from "react";

export const useSetSubtaskModel = ({
  isSubTask,
  customAgent,
}: { isSubTask: boolean; customAgent?: ValidCustomAgentFile }) => {
  const { customAgentModel } = useCustomAgent(customAgent?.name);
  const { updateSelectedModelId } = useSelectedModels({ isSubTask });

  useEffect(() => {
    if (!isSubTask) return;

    if (customAgentModel) {
      updateSelectedModelId(customAgentModel.id);
    }
  }, [isSubTask, customAgentModel, updateSelectedModelId]);
};
