import { useModelList } from "@/lib/hooks/use-model-list";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pick } from "remeda";
import { useSettingsStore } from "../store";

export type ModelGroup = {
  title: string;
  models: DisplayModel[];
  isCustom?: boolean;
};
export type ModelGroups = ModelGroup[];

type UseSelectedModelsOptions = {
  isSubTask: boolean;
};
export function useSelectedModels(options?: UseSelectedModelsOptions) {
  const { t } = useTranslation();
  const isSubTask = options?.isSubTask ?? false;
  const {
    selectedModel: selectedModelFromStore,
    updateSelectedModel: updateSelectedModelInStore,
    subtaskAutoApproveSettings,
    updateSubtaskAutoApproveSettings,
  } = useSettingsStore();
  const { modelList: models, isLoading } = useModelList(true);
  const groupedModels = useMemo<ModelGroups | undefined>(() => {
    if (!models) return undefined;
    const superModels: ModelGroup = {
      title: t("modelSelect.super"),
      models: [],
    };
    const swiftModels: ModelGroup = {
      title: t("modelSelect.swift"),
      models: [],
    };
    const customModels: ModelGroup = {
      title: t("modelSelect.custom"),
      models: [],
    };

    for (const x of models) {
      if (x.type === "vendor" && x.vendorId === "pochi") {
        if (x.options.label === "super") {
          superModels.models.push(x);
        } else {
          swiftModels.models.push(x);
        }
      } else {
        customModels.models.push(x);
      }
    }

    return [superModels, swiftModels, customModels];
  }, [models, t]);

  const selectedModel = useMemo(() => {
    const targetModelId = isSubTask
      ? subtaskAutoApproveSettings.modelId
      : selectedModelFromStore?.id;
    if (!targetModelId) return undefined;

    return models?.find((x) => x.id === targetModelId);
  }, [
    selectedModelFromStore,
    models,
    isSubTask,
    subtaskAutoApproveSettings.modelId,
  ]);

  const updateSelectedModel = useCallback(
    (modelId: string | undefined) => {
      if (!modelId) return;
      const model = models?.find((x) => x.id === modelId);
      if (!model) return;

      if (isSubTask) {
        updateSubtaskAutoApproveSettings({ modelId: model.id });
      } else {
        updateSelectedModelInStore(pick(model, ["id", "name"]));
      }
    },
    [
      models,
      updateSelectedModelInStore,
      isSubTask,
      updateSubtaskAutoApproveSettings,
    ],
  );

  // set initial model
  useEffect(() => {
    if (!isLoading && !selectedModelFromStore && !!models?.length) {
      updateSelectedModelInStore(pick(models[0], ["id", "name"]));
    }
  }, [isLoading, models, selectedModelFromStore, updateSelectedModelInStore]);

  return {
    isLoading,
    models,
    groupedModels,
    selectedModel,
    updateSelectedModel,
    // for fallback display
    selectedModelFromStore,
  };
}
