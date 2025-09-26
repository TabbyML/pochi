import { ScrollArea } from "@/components/ui/scroll-area";
import { vscodeHost } from "@/lib/vscode";
import { FileIcon } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { MentionListActions } from "../shared";
import {
  useMentionItems,
  useMentionKeyboardNavigation,
  useScrollIntoView,
} from "../shared";

// Types for workflow items
export interface WorkflowItem {
  id: string;
  path: string;
  content: string;
  frontmatter: { model?: string };
}

export interface WorkflowListProps {
  items: WorkflowItem[];
  command: (item: { id: string; path: string; content: string }) => void;
  query?: string;
  fetchItems?: (query?: string) => Promise<WorkflowItem[]>;
  onSelectWorkflow?: (workflow: WorkflowItem) => void;
}

/**
 * A React component for the workflow dropdown list.
 * Displays when a user types '/...' and suggestions are fetched.
 * Reads the file content when a workflow is selected.
 */
export const WorkflowMentionList = forwardRef<
  MentionListActions,
  WorkflowListProps
>(
  (
    { items: initialItems, command, query, fetchItems, onSelectWorkflow },
    ref,
  ) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const items = useMentionItems(initialItems, query, fetchItems);

    // Reset selected index when items change to prevent out-of-bounds access
    useEffect(() => {
      if (selectedIndex >= items.length) {
        setSelectedIndex(Math.max(0, items.length - 1));
      }
    }, [items.length, selectedIndex]);

    const handleSelect = useCallback(
      async (item: WorkflowItem) => {
        vscodeHost.capture({
          event: "selectWorkflow",
          properties: {
            workflowId: item.id,
          },
        });
        command(item);
        onSelectWorkflow?.(item);
      },
      [command, onSelectWorkflow],
    );

    const keyboardNavigation = useMentionKeyboardNavigation(
      items,
      selectedIndex,
      setSelectedIndex,
      handleSelect,
    );

    useImperativeHandle(ref, () => keyboardNavigation);

    return (
      <div className="relative flex w-[200px] max-w-full flex-col overflow-hidden py-1">
        <ScrollArea viewportClassname="max-h-[300px] px-2">
          {items.length === 0 ? (
            <div className="px-2 py-3 text-muted-foreground text-xs">
              {query ? "No workflows found" : "Type to search workflows..."}
            </div>
          ) : (
            <div className="grid gap-0.5">
              {items.map((item, index) => (
                <WorkflowItemView
                  key={item.id}
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
  },
);

WorkflowMentionList.displayName = "WorkflowMentionList";

interface WorkflowItemViewProps {
  isSelected: boolean;
  data: WorkflowItem;
  onClick: () => void;
}

/**
 * Workflow item view for displaying workflow files
 */
const WorkflowItemView = memo(function WorkflowItemView({
  isSelected,
  data,
  ...rest
}: WorkflowItemViewProps) {
  const ref = useScrollIntoView(isSelected);

  return (
    <div
      className={`flex cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
      }`}
      {...rest}
      ref={ref}
    >
      <FileIcon className="size-4 shrink-0" />
      <span className="mr-2 ml-1 truncate whitespace-nowrap font-medium">
        {data.id}
      </span>
    </div>
  );
});
