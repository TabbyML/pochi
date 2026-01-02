import type { TaskThreadSource } from "@/components/task-thread";
import type { ToolCallStatusRegistry } from "@/features/chat";
import { WALKTHROUGH_AGENT_NAME } from "@getpochi/common";
import type { TFunction } from "i18next";
import type { ReactNode, RefObject } from "react";
import { StatusIcon } from "../status-icon";
import type { ToolProps } from "../types";

export interface SubAgentRenderProps extends ToolProps<"newTask"> {
  taskSource?: (TaskThreadSource & { parentId?: string }) | undefined;
  uid: string | undefined;
  toolCallStatusRegistryRef?: RefObject<ToolCallStatusRegistry>;
}

type SubAgentRenderer = {
  match: (props: SubAgentRenderProps) => boolean;
  render: (props: SubAgentRenderProps, t: TFunction) => ReactNode;
};

export function renderSubAgentView(
  props: SubAgentRenderProps,
  t: TFunction,
): ReactNode | null {
  const renderer = subAgentRenderers.find((entry) => entry.match(props));
  return renderer ? renderer.render(props, t) : null;
}

const walkthroughRenderer: SubAgentRenderer = {
  match: ({ tool }) => {
    const agentType = tool.input?.agentType;
    return agentType?.toLowerCase() === WALKTHROUGH_AGENT_NAME;
  },
  render: ({ tool, isExecuting }, t) => {
    const description = tool.input?.description ?? "";
    const result =
      tool.state === "output-available" && "result" in tool.output
        ? tool.output.result.trim()
        : "";
    const statusLabel =
      tool.state === "output-available"
        ? t("walkthrough.status.ready")
        : isExecuting
          ? t("walkthrough.status.generating")
          : t("walkthrough.status.pending");

    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <StatusIcon tool={tool} isExecuting={isExecuting} />
          <span className="font-medium">{t("walkthrough.title")}</span>
          <span className="text-muted-foreground">{statusLabel}</span>
        </div>
        {result || description ? (
          <div className="mt-1 truncate text-muted-foreground text-xs">
            {result || description}
          </div>
        ) : null}
      </div>
    );
  },
};

const subAgentRenderers: SubAgentRenderer[] = [walkthroughRenderer];
