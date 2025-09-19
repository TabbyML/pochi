import { useModelList } from "@/lib/hooks/use-model-list";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pick } from "remeda";
import { useSettingsStore } from "../store";

export type ModelGroup = {
  title: string;
  models: DisplayModel[];
  isCustom?: boolean;
};
export type ModelGroups = ModelGroup[];

export function useSelectedModels() {
  const { t } = useTranslation();
  const { selectedModel: selectedModelFromStore, updateSelectedModel } =
    useSettingsStore();
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
    const model = models?.find((x) => x.id === selectedModelFromStore?.id);
    return model;
  }, [selectedModelFromStore, models]);

  // set initial model
  useEffect(() => {
    if (!isLoading && !selectedModelFromStore && !!models?.length) {
      updateSelectedModel(pick(models[0], ["id", "name"]));
    }
  }, [isLoading, models, selectedModelFromStore, updateSelectedModel]);

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
