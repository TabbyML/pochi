import { ScrollArea } from "@/components/ui/scroll-area";
import { vscodeHost } from "@/lib/vscode";
import type { CustomAgent } from "@getpochi/tools";
import { FileIcon } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { MentionListActions } from "../shared";
import {
  useMentionItems,
  useMentionKeyboardNavigation,
  useScrollIntoView,
} from "../shared";

// Types for workflow items
export interface WorkflowData {
  id: string;
  path: string;
  content: string;
  frontmatter: { model?: string };
}

export type SlashCandidate =
  | {
      type: "workflow";
      id: string;
      label: string;
      path: string;
      rawData: WorkflowData;
    }
  | {
      type: "custom-agent";
      id: string;
      label: string;
      path: string;
      rawData: CustomAgent;
    };

export interface SlashMentionListProps {
  items: SlashCandidate[];
  command: (item: SlashCandidate) => void;
  query?: string;
  fetchItems?: (query?: string) => Promise<SlashCandidate[]>;
  onSelect?: (data: SlashCandidate) => void;
}

/**
 * A React component for the slash dropdown list.
 * Displays when a user types '/...' and suggestions are fetched.
 * Reads the file content when a slash command candidate is selected.
 */
export const SlashMentionList = forwardRef<
  MentionListActions,
  SlashMentionListProps
>(({ items: initialItems, command, query, fetchItems, onSelect }, ref) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = useMentionItems(initialItems, query, fetchItems);
  // Reset selected index when items change to prevent out-of-bounds access
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  const handleSelect = useCallback(
    async (item: SlashCandidate) => {
      if (item.type === "workflow") {
        vscodeHost.capture({
          event: "selectWorkflow",
          properties: {
            workflowId: item.rawData.id,
          },
        });
      }
      if (item.type === "custom-agent") {
        vscodeHost.capture({
          event: "selectCustomAgent",
          properties: {
            customAgentName: item.rawData.name,
          },
        });
      }
      command(item);
      onSelect?.(item);
    },
    [command, onSelect],
  );

  const keyboardNavigation = useMentionKeyboardNavigation(
    items,
    selectedIndex,
    setSelectedIndex,
    handleSelect,
  );

  useImperativeHandle(ref, () => keyboardNavigation);

  return (
    <div className="relative flex w-[240px] max-w-full flex-col overflow-hidden py-1">
      <ScrollArea viewportClassname="max-h-[300px] px-2">
        {items.length === 0 ? (
          <div className="px-2 py-3 text-muted-foreground text-xs">
            {query
              ? t("mentionList.noResultsFound")
              : t("mentionList.typeToSearch")}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {items.map((item, index) => (
              <CandidateItemView
                key={getOptionKey(item, index)}
                onClick={() => handleSelect(item)}
                isSelected={index === selectedIndex}
                data={item}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

SlashMentionList.displayName = "SlashMentionList";

interface CandidateItemViewProps {
  isSelected: boolean;
  data: SlashCandidate;
  onClick: () => void;
}

/**
 * Candidate item view for displaying workflow / custom-agent files
 */
const CandidateItemView = memo(function SlashCandidateItemView({
  isSelected,
  data,
  ...rest
}: CandidateItemViewProps) {
  const { t } = useTranslation();
  const ref = useScrollIntoView(isSelected);

  return (
    <div
      className={`flex cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
      }`}
      {...rest}
      ref={ref}
    >
      <div className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        <FileIcon className="size-4 shrink-0" />
        <span className="mr-2 ml-1 truncate whitespace-nowrap font-medium">
          {data.label}
        </span>
      </div>
      <span className="text-muted-foreground text-xs">
        {data.type === "workflow"
          ? t("mentionList.workflow")
          : t("mentionList.agent")}
      </span>
    </div>
  );
});

function getOptionKey(option: SlashCandidate, idx: number) {
  if (option.type === "custom-agent") {
    return `agent_${option.id}`;
  }
  if (option.type === "workflow") {
    return `workflow_${option.id}`;
  }

  return idx;
}
