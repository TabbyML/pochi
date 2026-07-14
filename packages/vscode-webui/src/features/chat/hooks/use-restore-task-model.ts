import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import { useEffect, useRef } from "react";

export const useRestoreTaskModel = (
  task: Task | undefined,
  info: PochiTaskInfo,
  isModelsLoading: boolean,
  updateSelectedModelId: (modelId: string) => void,
) => {
  const restored = useRef(false);
  const infoModelId = info.type === "compact-task" ? info.modelId : undefined;

  useEffect(() => {
    const modelId = infoModelId ?? task?.modelId;
    if (modelId && !isModelsLoading && !restored.current) {
      restored.current = true;
      updateSelectedModelId(modelId);
    }
  }, [task?.modelId, infoModelId, updateSelectedModelId, isModelsLoading]);
};
