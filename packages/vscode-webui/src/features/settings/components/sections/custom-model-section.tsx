import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DotIcon, PencilIcon } from "lucide-react";
import { useCustomModelSetting } from "../../hooks/use-custom-model-setting";
import { EmptySectionPlaceholder, ScetionItem, Section } from "../ui/section";

export const CustomModelSection: React.FC = () => {
  const { customModelSettings, isLoading } = useCustomModelSetting();

  const title = (
    <TooltipProvider>
      <div className="flex items-center">
        Custom Models
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="command:pochi.openCustomModelSettings"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-1 hover:bg-muted"
            >
              <PencilIcon className="ml-1 size-3" />
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p>Manage your custom models.</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  return (
    <Section title={title}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 1 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-secondary" />
          ))}
        </div>
      ) : customModelSettings && customModelSettings.length > 0 ? (
        <div className="space-y-4">
          {customModelSettings.map((provider) => (
            <div key={provider.id}>
              <div className="px-1 font-medium text-muted-foreground text-sm">
                {provider.name ?? provider.id}
              </div>
              <div className="mt-1 space-y-2">
                {provider.models.map((model) => (
                  <ScetionItem
                    key={model.id}
                    title={model.name ?? model.id}
                    icon={<DotIcon className="size-6 text-muted-foreground" />}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptySectionPlaceholder content="No custom models found." />
      )}
    </Section>
  );
};
