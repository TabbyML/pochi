import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type User, apiClient } from "@/lib/auth-client";
import { useCustomModelSetting } from "@/lib/hooks/use-custom-model-setting";
import { useVSCodeLmModels } from "@/lib/hooks/use-vscode-lm-models";
import { useQuery } from "@tanstack/react-query";
import { DotIcon, PencilIcon, CircleQuestionMarkIcon } from "lucide-react";
import { useMemo } from "react";
import { useSettingsStore } from "../../store";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, Section } from "../ui/section";

interface ModelSectionProps {
  user?: User;
}

export const ModelSection: React.FC<ModelSectionProps> = ({ user }) => {
  const { enablePochiModels, enableVSCodeLm, updateEnableVSCodeLm } =
    useSettingsStore();
  const { data: pochiModelsData, isLoading: isPochiModelLoading } = useQuery({
    queryKey: ["models", user?.id],
    queryFn: async () => {
      const res = await apiClient.api.models.$get();
      return await res.json();
    },
    enabled: !!user,
  });

  const pochiModels = useMemo(() => {
    if (!pochiModelsData) return undefined;

    let models = pochiModelsData
      .filter((x) => x)
      .sort((a, b) => {
        if (a.costType === "premium" && b.costType !== "premium") {
          return -1;
        }
        if (a.costType !== "premium" && b.costType === "premium") {
          return 1;
        }
        return 0;
      });
    if (!enablePochiModels) {
      models = models.filter((model) => !model.id.startsWith("pochi/"));
    }
    return models;
  }, [pochiModelsData, enablePochiModels]);

  const { customModelSettings, isLoading: isCustomModelLoading } =
    useCustomModelSetting();

  const getCostTypeBadgeText = (costType: "basic" | "premium") => {
    return costType === "premium" ? "Super" : "Swift";
  };

  const getCostTypeBadgeVariant = (costType: "basic" | "premium") => {
    return costType === "premium" ? "default" : "secondary";
  };

  const {
    models: vscodeLmModels,
    isLoading: isLoadingVscodeLmModels,
    featureAvailable,
  } = useVSCodeLmModels();

  const hasModels =
    !!pochiModels?.length ||
    !!customModelSettings?.length ||
    !!vscodeLmModels?.length;

  return (
    <Section title={<div className="flex items-center">Models</div>}>
      {isPochiModelLoading ||
      isCustomModelLoading ||
      isLoadingVscodeLmModels ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-secondary" />
          ))}
        </div>
      ) : hasModels ? (
        <div className="space-y-3">
          {/* Pochi Models Section */}
          {!!user && (
            <div className="ml-1">
              <AccordionSection
                title={
                  <div className="flex items-center gap-0.5 py-1">
                    Pochi
                    <a
                      href="https://app.getpochi.com/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 ml-1 rounded-md p-1.5 transition-colors hover:bg-secondary/50 hover:text-secondary-foreground dark:hover:bg-secondary"
                    >
                      <CircleQuestionMarkIcon className="size-4" />
                    </a>
                  </div>
                }
                variant="compact"
                className="py-0"
              >
                <div className="space-y-2">
                  {pochiModels?.map((model) => (
                    <div key={model.id} className="group rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                          <div className="flex size-6 shrink-0 items-center justify-center">
                            <DotIcon className="size-6 text-muted-foreground" />
                          </div>
                          <span className="truncate font-semibold">
                            {model.id}
                          </span>
                        </div>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href="https://app.getpochi.com/pricing"
                          className="cursor-pointer"
                        >
                          <Badge
                            variant={
                              getCostTypeBadgeVariant(model.costType) as
                                | "default"
                                | "secondary"
                            }
                            className="text-xs"
                          >
                            {getCostTypeBadgeText(model.costType)}
                          </Badge>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>
          )}
          {/* Copilot Models Section */}
          {featureAvailable && (
            <div className="ml-1">
              <AccordionSection
                title={
                  <div className="flex items-center gap-2 py-1">
                    Copilot
                    <Switch
                      className="scale-75 cursor-pointer transition-all hover:bg-accent/20 hover:shadow-md "
                      checked={enableVSCodeLm}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateEnableVSCodeLm(!enableVSCodeLm);
                      }}
                    />
                  </div>
                }
                variant="compact"
                className="py-0"
                defaultOpen
              >
                <div className="space-y-2">
                  {enableVSCodeLm ? (
                    vscodeLmModels.length > 0 ? (
                      vscodeLmModels.map((model) => (
                        <div
                          key={model.id}
                          className="group rounded-md border p-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                              <div className="flex size-6 shrink-0 items-center justify-center">
                                <DotIcon className="size-6 text-muted-foreground" />
                              </div>
                              <span className="truncate font-semibold">
                                {model.vendor}/{model.id}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground text-xs">
                        No copilot models found
                      </div>
                    )
                  ) : (
                    <div className="text-muted-foreground text-xs">
                      Copilot models are disabled. Turn on the switch to enable
                      them.
                    </div>
                  )}
                </div>
              </AccordionSection>
            </div>
          )}

          {/* Custom Models Section */}
          {customModelSettings?.map(
            (provider) =>
              provider.models &&
              provider.models.length > 0 && (
                <div key={provider.id} className="ml-1">
                  <AccordionSection
                    title={
                      <div className="flex items-center gap-0.5 py-1">
                        {provider.name || provider.id}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href="command:pochi.openCustomModelSettings"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative z-10 ml-1 rounded-md p-2 transition-colors hover:bg-secondary/50 hover:text-secondary-foreground dark:hover:bg-secondary"
                              >
                                <PencilIcon className="size-3" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Manage your custom models.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    }
                    variant="compact"
                    className="py-0"
                    defaultOpen
                  >
                    <div className="space-y-2">
                      {provider.models.map((model) => (
                        <div
                          key={model.id}
                          className="group rounded-md border p-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                              <div className="flex size-6 shrink-0 items-center justify-center">
                                <DotIcon className="size-6 text-muted-foreground" />
                              </div>
                              <span className="truncate font-semibold">
                                {model.name ?? model.id}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionSection>
                </div>
              ),
          )}
        </div>
      ) : (
        <EmptySectionPlaceholder content="No models found" />
      )}
    </Section>
  );
};
