import { useModelAccess } from "@/lib/hooks/use-model-access";
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
  label?: string;
};
export type ModelGroups = ModelGroup[];

type UseSelectedModelsOptions = {
  isSubTask: boolean;
  /** Resolves a current model without adding it to the selectable list. */
  modelOverride?: DisplayModel;
};

const useModelSelectionState = (isSubtask: boolean) => {
  const settings = useSettingsStore();

  if (isSubtask) {
    return {
      updateSelectedModel: settings.updateSubtaskSelectedModel,
      selectedModel: settings.subtaskSelectedModel,
    };
  }
  return {
    updateSelectedModel: settings.updateSelectedModel,
    selectedModel: settings.selectedModel,
  };
};

export function useSelectedModels(options?: UseSelectedModelsOptions) {
  const { t } = useTranslation();
  const isSubTask = options?.isSubTask ?? false;
  const modelOverride = options?.modelOverride;

  const {
    modelList: models,
    isLoading,
    isFetching: isModelListFetching,
    reload: reloadModelList,
  } = useModelList(true);
  const { selectedModel: selectedModelFromStore } = useSettingsStore();
  const { updateSelectedModel, selectedModel: storedSelectedModel } =
    useModelSelectionState(isSubTask);

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

  // SelectedModel with full information
  const selectedModel = useMemo<DisplayModel | undefined>(() => {
    const targetModelId = storedSelectedModel?.id;
    if (!targetModelId) return undefined;
    if (modelOverride?.id === targetModelId) return modelOverride;
    return models?.find((m) => m.id === targetModelId);
  }, [storedSelectedModel, models, modelOverride]);

  const updateSelectedModelId = useCallback(
    (modelId: string | undefined) => {
      if (!modelId) return;
      const model =
        modelOverride?.id === modelId
          ? modelOverride
          : models?.find((m) => m.id === modelId);
      if (!model) return;
      updateSelectedModel(pick(model, ["id", "name"]));
    },
    [models, modelOverride, updateSelectedModel],
  );

  const {
    superModels,
    isLoading: isAccessLoading,
    isError: isAccessError,
    isFetching: isAccessFetching,
    refetch: reloadAccess,
  } = useModelAccess();
  const isFetching = isModelListFetching || isAccessFetching;
  const reload = useCallback(async () => {
    await Promise.all([reloadModelList?.(), reloadAccess()]);
  }, [reloadModelList, reloadAccess]);

  // Effect to set an initial model if none is selected and models are loaded.
  useEffect(() => {
    if (!isLoading && !selectedModelFromStore && models?.length) {
      const initialModel = models.find(
        (model) =>
          model.type !== "vendor" ||
          model.vendorId !== "pochi" ||
          model.options.label !== "super" ||
          (superModels && !isAccessLoading && !isAccessError),
      );
      if (initialModel) {
        updateSelectedModel(pick(initialModel, ["id", "name"]));
      }
    }
  }, [
    isLoading,
    isAccessLoading,
    isAccessError,
    models,
    selectedModelFromStore,
    updateSelectedModel,
    superModels,
  ]);

  return {
    isLoading,
    isFetching,
    reload,
    models,
    groupedModels,
    // model with full information
    selectedModel,
    updateSelectedModelId,
    // model for fallback display
    selectedModelFromStore,
  };
}
