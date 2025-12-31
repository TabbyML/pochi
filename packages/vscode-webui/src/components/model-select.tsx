"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import LoadingWrapper from "@/components/loading-wrapper";
import type { ModelGroups } from "@/features/settings";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";

type ModelSelectValue = Pick<DisplayModel, "id" | "name">;

interface ModelSelectProps {
  models: ModelGroups | undefined;
  value: ModelSelectValue | undefined;
  onChange: (v: string) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  isValid?: boolean;
  triggerClassName?: string;
  reloadModels?: () => Promise<void>;
}

export function ModelSelect({
  models,
  value,
  onChange,
  isLoading,
  isFetching,
  isValid,
  triggerClassName,
  reloadModels,
}: ModelSelectProps) {
  const { t } = useTranslation();

  const hostedModels = models?.filter((x) => !x.isCustom);
  const customModels = models?.filter((x) => x.isCustom);

  const onSelectModel = (v: DisplayModel) => {
    onChange(v.id);
  };

  return (
    <LoadingWrapper
      loading={isLoading}
      fallback={
        <div className="p-1">
          <Skeleton className="h-4 w-32 bg-[var(--vscode-inputOption-hoverBackground)]" />
        </div>
      }
    >
      <div className="h-6 select-none overflow-hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "!gap-0.5 !px-1 button-focus h-6 max-w-full items-center py-0 font-normal",
                triggerClassName,
              )}
            >
              {!isValid && (
                <HoverCard openDelay={0}>
                  <HoverCardTrigger asChild>
                    <span>
                      <TriangleAlertIcon className="mr-1 size-3.5 " />
                    </span>
                  </HoverCardTrigger>
                  <HoverCardContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    className="!w-auto max-w-sm bg-background px-3 py-1.5 text-xs"
                  >
                    {t("modelSelect.modelUnavailable")}
                  </HoverCardContent>
                </HoverCard>
              )}
              <span
                className={cn(
                  "truncate whitespace-nowrap transition-colors duration-200",
                  !value && "text-muted-foreground",
                )}
              >
                {value?.name ?? t("modelSelect.selectModel")}
              </span>
              <ChevronDownIcon
                className={cn(
                  "size-4 shrink-0 transition-colors duration-200",
                  !value && "text-muted-foreground",
                )}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => e.preventDefault()}
              side="bottom"
              align="start"
              alignOffset={6}
              className="dropdown-menu max-h-[32vh] min-w-[18rem] animate-in overflow-y-auto overflow-x-hidden rounded-md border bg-background p-2 text-popover-foreground shadow"
            >
              <DropdownMenuRadioGroup>
                {hostedModels
                  ?.filter((group) => group.models.length > 0)
                  .map((group) => (
                    <div key={group.title}>
                      <div className="px-2 py-1.5 font-semibold text-muted-foreground text-sm">
                        {group.title}
                      </div>
                      {group.models.map((model: DisplayModel) => {
                        const isSelected = model.id === value?.id;
                        return (
                          <DropdownMenuRadioItem
                            onClick={(e) => {
                              onSelectModel(model);
                              e.stopPropagation();
                            }}
                            value={model.id}
                            key={model.id}
                            className="cursor-pointer py-2 pl-2"
                          >
                            <CheckIcon
                              className={cn(
                                "mr-1 shrink-0",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span
                              className={cn({
                                "font-semibold": isSelected,
                              })}
                            >
                              {model.name}
                            </span>
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </div>
                  ))}
                {!!hostedModels?.filter((group) => group.models.length > 0)
                  .length && <DropdownMenuSeparator />}
                {customModels?.map((group) => (
                  <div key={group.title}>
                    {group.models.map((model: DisplayModel) => {
                      const isSelected = model.id === value?.id;
                      return (
                        <DropdownMenuRadioItem
                          onClick={(e) => {
                            onSelectModel(model);
                            e.stopPropagation();
                          }}
                          value={model.id}
                          key={model.id}
                          className="cursor-pointer py-2 pl-2"
                        >
                          <CheckIcon
                            className={cn(
                              "mr-1 shrink-0",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span
                            className={cn({
                              "font-semibold": isSelected,
                            })}
                          >
                            {model.name}
                          </span>
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </div>
                ))}

                {!!customModels?.flat().length && <DropdownMenuSeparator />}
                <div className="flex items-center justify-between gap-2 px-2">
                  <a
                    href="command:pochi.openCustomModelSettings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group cursor-pointer px-3 py-2.5"
                  >
                    <span className="text-[var(--vscode-textLink-foreground)] text-xs group-hover:underline ">
                      {t("modelSelect.manageCustomModels")}
                    </span>
                  </a>
                  <span
                    onClick={() => {
                      if (isFetching) {
                        return;
                      }
                      reloadModels?.();
                    }}
                    className="flex cursor-pointer items-center gap-1 px-3 py-2.5 text-[var(--vscode-textLink-foreground)] text-xs hover:underline"
                  >
                    <RefreshCwIcon
                      className={cn("size-3 opacity-0", {
                        "animate-spin opacity-100": isFetching,
                      })}
                    />
                    {t("modelSelect.reload")}
                  </span>
                </div>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </LoadingWrapper>
  );
}
