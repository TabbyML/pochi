import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useModelList } from "@/lib/hooks/use-model-list";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { CircleQuestionMarkIcon, DotIcon, PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, Section } from "../ui/section";

export const ModelSection = () => {
  const { t } = useTranslation();
  const { modelList = [], isLoading } = useModelList(false);
  const { enablePochiModels } = useSettingsStore();

  const getCostTypeBadgeText = (label?: string) => {
    return label === "super" ? t("modelSelect.super") : t("modelSelect.swift");
  };

  const getCostTypeBadgeVariant = (label?: string) => {
    return label === "super" ? "default" : "secondary";
  };

  const hasModels = modelList.length > 0;
  const pochiModels = modelList
    .filter(
      (x): x is Extract<DisplayModel, { type: "vendor" }> =>
        x.type === "vendor" &&
        x.vendorId === "pochi" &&
        (!x.modelId.startsWith("pochi/") || enablePochiModels),
    )
    .sort((lhs, rhs) => {
      const lhsLabel = lhs.options.label;
      const rhsLabel = rhs.options.label;
      if (!lhsLabel || !rhsLabel) return 0;
      return lhsLabel.localeCompare(rhsLabel);
    });

  const vendorModels = modelList.filter(
    (x): x is Extract<DisplayModel, { type: "vendor" }> =>
      x.type === "vendor" && x.vendorId !== "pochi",
  );

  const providerModels = modelList.filter(
    (x): x is Extract<DisplayModel, { type: "provider" }> =>
      x.type === "provider",
  );

  return (
    <Section
      title={
        <div className="flex items-center">{t("settings.models.title")}</div>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-secondary" />
          ))}
        </div>
      ) : hasModels ? (
        <div className="space-y-3">
          {/* Pochi Models Section */}
          {pochiModels.length > 0 && (
            <div className="ml-1">
              <AccordionSection
                localStorageKey="pochi-models-section"
                title={
                  <div className="flex items-center gap-0.5 py-1">
                    Pochi
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href="https://app.getpochi.com/pricing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative z-10 ml-1 rounded-md p-1.5 transition-colors hover:bg-secondary/50 hover:text-secondary-foreground dark:hover:bg-secondary"
                          >
                            <CircleQuestionMarkIcon className="size-4" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t("settings.models.viewPricing")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                }
                variant="compact"
                className="py-0"
              >
                <div className="space-y-2">
                  {pochiModels.map((model) => (
                    <div key={model.id} className="group rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                          <div className="flex size-6 shrink-0 items-center justify-center">
                            <DotIcon className="size-6 text-muted-foreground" />
                          </div>
                          <span className="truncate font-semibold">
                            {model.name}
                          </span>
                        </div>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href="https://app.getpochi.com/pricing"
                          className="cursor-pointer"
                        >
                          <Badge
                            variant={getCostTypeBadgeVariant(
                              model.options.label,
                            )}
                            className="text-xs"
                          >
                            {getCostTypeBadgeText(model.options.label)}
                          </Badge>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>
          )}

          {/* Custom Models Section */}
          {providerModels.length > 0 && (
            <div className="ml-1">
              <AccordionSection
                localStorageKey="byok-models-section"
                title={
                  <div className="flex items-center gap-0.5 py-1">
                    BYOK
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
                          <p>{t("settings.models.customModelsTooltip")}</p>
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
                  {Object.entries(providerModels).map(([modelId, model]) => (
                    <div key={modelId} className="group rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                          <div className="flex size-6 shrink-0 items-center justify-center">
                            <DotIcon className="size-6 text-muted-foreground" />
                          </div>
                          <span className="truncate font-semibold">
                            {model.name ?? modelId}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>
          )}
        </div>
      ) : (
        <EmptySectionPlaceholder content={t("settings.models.noModelsFound")} />
      )}

      {vendorModels.length > 0 && (
        <div className="ml-1">
          <AccordionSection
            localStorageKey="vendor-models-section"
            title={
              <div className="flex items-center gap-2 py-1">Third-party</div>
            }
            variant="compact"
            className="py-0"
            defaultOpen
          >
            <div className="space-y-2">
              {vendorModels.map((model) => (
                <div key={model.id} className="group rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-1 items-center gap-2 overflow-x-hidden">
                      <div className="flex size-6 shrink-0 items-center justify-center">
                        <DotIcon className="size-6 text-muted-foreground" />
                      </div>
                      <span className="truncate font-semibold">
                        {model.name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>
        </div>
      )}
    </Section>
  );
};
