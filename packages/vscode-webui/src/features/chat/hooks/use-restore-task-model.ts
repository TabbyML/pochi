import type { Task } from "@getpochi/livekit";
import { useEffect, useRef } from "react";

export const useRestoreTaskModel = (
  task: Task | undefined,
  isModelsLoading: boolean,
  updateSelectedModelId: (modelId: string) => void,
) => {
  const restored = useRef(false);
  useEffect(() => {
    if (task?.modelId && !isModelsLoading && !restored.current) {
      restored.current = true;
      updateSelectedModelId(task.modelId);
    }
  }, [task?.modelId, updateSelectedModelId, isModelsLoading]);
};
