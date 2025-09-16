"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import LoadingWrapper from "@/components/loading-wrapper";
import type { ModelGroups } from "@/features/settings";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";

interface ModelSelectProps {
  models: ModelGroups | undefined;
  value: DisplayModel | undefined;
  onChange: (v: DisplayModel) => void;
  isLoading?: boolean;
  isValid?: boolean;
  triggerClassName?: string;
}

export function ModelSelect({
  models,
  value,
  onChange,
  isLoading,
  isValid,
  triggerClassName,
}: ModelSelectProps) {
  const { t } = useTranslation();

  const hostedModels = models?.filter((x) => !x.isCustom);
  const customModels = models?.filter((x) => x.isCustom);

  const onSelectModel = (v: DisplayModel) => {
    onChange(v);
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
                "!gap-0.5 !px-1 button-focus h-6 max-w-full py-0 font-normal",
                triggerClassName,
              )}
            >
              {!isValid && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <TriangleAlertIcon className="mr-1 size-3.5 text-yellow-600 dark:text-yellow-400" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    showArrow={false}
                    className="max-w-sm sm:max-w-md"
                    side="top"
                    sideOffset={4}
                  >
                    {t("modelSelect.modelUnavailable")}
                  </TooltipContent>
                </Tooltip>
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
                {hostedModels?.map((group) => (
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
                {!!hostedModels?.length && <DropdownMenuSeparator />}
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
                <DropdownMenuItem asChild>
                  <a
                    href="command:pochi.openCustomModelSettings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex cursor-pointer items-center gap-2 px-3 py-1"
                  >
                    <span className="text-[var(--vscode-textLink-foreground)] text-xs">
                      {t("modelSelect.manageCustomModels")}
                    </span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </LoadingWrapper>
  );
}
