import { useModelList } from "@/lib/hooks/use-model-list";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../store";

export type ModelGroup = {
  title: string;
  models: DisplayModel[];
  isCustom?: boolean;
};
export type ModelGroups = ModelGroup[];

export function useSelectedModels() {
  const { t } = useTranslation();
  const { selectedModelId, updateSelectedModelId } = useSettingsStore();
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
  const [isModelReady, setIsModelReady] = useState(
    !!selectedModelId &&
      getModelIdFromModelInfo(selectedModelId, models) === selectedModelId,
  );

  useEffect(() => {
    if (!isLoading) {
      // validate and init model
      const validModelId = getModelIdFromModelInfo(selectedModelId, models);
      if (validModelId !== selectedModelId) {
        updateSelectedModelId(validModelId);
      }
      setIsModelReady(!!validModelId);
    }
  }, [isLoading, models, selectedModelId, updateSelectedModelId]);

  const selectedModel = models?.find((x) => x.id === selectedModelId);

  return {
    isLoading: isLoading || !isModelReady,
    models,
    groupedModels,
    selectedModel,
    updateSelectedModelId,
  };
}

function getModelIdFromModelInfo(
  modelId: string | undefined,
  models: DisplayModel[] | undefined,
): string | undefined {
  if (!models?.length) return undefined;

  const targetModel = modelId
    ? models.find((x) => x.id === modelId)
    : undefined;

  if (targetModel) {
    return targetModel.id;
  }

  // return the first model by default
  return models[0].id;
}
