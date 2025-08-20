import { apiClient, authHooks } from "@/lib/auth-client";
import { useCustomModelSetting } from "@/lib/hooks/use-custom-model-setting";
import type { CustomModelSetting } from "@getpochi/common/vscode-webui-bridge";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "../store";

export type DisplayModel =
  | {
      type: "hosted";
      id: string;
      modelId: string;
      name: string;
      contextWindow: number;
      costType: "basic" | "premium";
    }
  | {
      type: "byok";
      id: string;
      modelId: string;
      name: string;
      contextWindow: number;
      maxTokens: number;
      useToolCallMiddleware?: boolean;
      costType: "basic";
      // https://github.com/microsoft/TypeScript/issues/31501#issuecomment-1079728677
      provider: RemoveModelsField<CustomModelSetting>;
    };

type RemoveModelsField<Type> = {
  [Property in keyof Type as Exclude<Property, "models">]: Type[Property];
};

export type ModelGroup = {
  title: string;
  models: DisplayModel[];
  isCustom?: boolean;
};
export type ModelGroups = ModelGroup[];

export function useModels() {
  const { data: auth } = authHooks.useSession();
  const user = auth?.user;
  const { enablePochiModels } = useSettingsStore();
  const { data, isLoading } = useQuery({
    queryKey: ["models", user?.id],
    queryFn: async () => {
      const res = await apiClient.api.models.$get();
      return await res.json();
    },
    enabled: !!user,
  });

  const { customModelSettings, isLoading: isLoadingCustomModelSettings } =
    useCustomModelSetting();

  const customModels = useMemo(() => {
    return customModelSettings?.flatMap((modelSetting) => {
      const { models, ...provider } = modelSetting;
      return models.map<DisplayModel>((model) => {
        return {
          ...model,
          type: "byok" as const,
          name: `${provider.name ?? provider.id}/${model.name ?? model.id}`,
          id: `${provider.id}/${model.id}`,
          modelId: model.id,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          useToolCallMiddleware: model.useToolCallMiddleware,
          costType: "basic",
          provider,
        };
      });
    });
  }, [customModelSettings]);

  const hasUser = !!user;
  const models = useMemo(() => {
    if (isLoading || !hasUser || !data) {
      return customModels || [];
    }

    let defaultModels = data.map<DisplayModel>((model) => ({
      type: "hosted" as const,
      ...model,
      name: model.id,
      modelId: model.id,
    }));
    if (!enablePochiModels) {
      defaultModels = defaultModels.filter(
        (model) => !model.id.startsWith("pochi/"),
      );
    }

    // Add custom models from OpenAI compatible models if available
    if (customModels && customModels.length > 0) {
      return [...defaultModels, ...customModels];
    }

    return defaultModels;
  }, [data, enablePochiModels, customModels, hasUser, isLoading]);

  return {
    models,
    isLoading: !(!isLoading && !isLoadingCustomModelSettings), // make sure hosted model and custom model are all loaded
  };
}

export function useSelectedModels() {
  const { selectedModelId, updateSelectedModelId } = useSettingsStore();
  const { models, isLoading } = useModels();
  const groupedModels = useMemo<ModelGroups | undefined>(() => {
    if (!models) return undefined;
    const groups: ModelGroups = [];
    const premiumModels = models.filter(
      (m) => m.type === "hosted" && m.costType === "premium",
    );
    if (premiumModels.length > 0) {
      groups.push({ title: "Super", models: premiumModels });
    }
    const basicModels = models.filter(
      (m) => m.type === "hosted" && m.costType === "basic",
    );
    if (basicModels.length > 0) {
      groups.push({ title: "Swift", models: basicModels });
    }
    const customModels = models.filter((m) => m.type === "byok");
    if (customModels.length > 0) {
      groups.push({
        title: "Custom",
        models: customModels,
        isCustom: true,
      });
    }
    return groups;
  }, [models]);
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
