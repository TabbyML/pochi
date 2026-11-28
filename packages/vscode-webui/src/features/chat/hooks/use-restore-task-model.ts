import { resolveModelFromId } from "@/lib/utils/resolve-model-from-id";
import type {
  DisplayModel,
  PochiTaskInfo,
} from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import { useEffect, useRef } from "react";

export const useRestoreTaskModel = (
  task: Task | undefined,
  info: PochiTaskInfo,
  isModelsLoading: boolean,
  updateSelectedModelId: (modelId: string) => void,
  models?: DisplayModel[],
) => {
  const restored = useRef(false);
  const infoModelId =
    info.type === "compact-task" || info.type === "new-task"
      ? info.modelId
      : undefined;

  useEffect(() => {
    if (isModelsLoading || restored.current) return;

    const resolvedInfoModelId = infoModelId
      ? (models?.find((m) => m.id === infoModelId)?.id ??
        resolveModelFromId(infoModelId, models)?.id)
      : undefined;
    const modelId = resolvedInfoModelId ?? task?.modelId;
    if (modelId) {
      restored.current = true;
      updateSelectedModelId(modelId);
    }
  }, [
    task?.modelId,
    infoModelId,
    models,
    updateSelectedModelId,
    isModelsLoading,
  ]);
};
