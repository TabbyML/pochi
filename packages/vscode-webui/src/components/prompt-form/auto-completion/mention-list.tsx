import { ScrollArea } from "@/components/ui/scroll-area";
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

export interface MentionItem {
  value: string;
  range: number[] | null;
}

export interface AutoCompleteListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
  query?: string;
  fetchItems?: (query?: string) => Promise<MentionItem[]>;
}

/**
 * A React component for the mention dropdown list.
 * Displays when a user types '@...' and suggestions are fetched.
 */
export const AutoCompleteMentionList = forwardRef<
  MentionListActions,
  AutoCompleteListProps
>(({ items: initialItems, command, query, fetchItems }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = useMentionItems(initialItems, query, fetchItems);

  // Reset selected index when items change to prevent out-of-bounds access
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  const handleSelect = useCallback(
    (item: MentionItem) => {
      command(item);
    },
    [command],
  );

  const keyboardNavigation = useMentionKeyboardNavigation(
    items,
    selectedIndex,
    setSelectedIndex,
    handleSelect,
  );

  useImperativeHandle(ref, () => keyboardNavigation);

  return (
    <div className="relative flex min-w-[120px] max-w-[250px] flex-col overflow-hidden py-1 sm:min-w-[250px] sm:max-w-[350px]">
      <ScrollArea viewportClassname="max-h-[300px] px-2">
        {items.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground text-xs">
            {query ? "No results found" : "Type to search..."}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {items.map((item, index) => (
              <MentionItemView
                key={item.value}
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

AutoCompleteMentionList.displayName = "MentionList";

interface MentionItemViewProps {
  isSelected: boolean;
  data: MentionItem;
  onClick: () => void;
}

/**
 * Mention item view for displaying id and filepath
 */
const MentionItemView = memo(function MentionItemView({
  isSelected,
  data,
  ...rest
}: MentionItemViewProps) {
  const ref = useScrollIntoView(isSelected);

  const highlightedText = () => {
    const { value, range } = data;
    const parts = [];
    let lastIndex = 0;
    if (!range) {
      return <span>{value}</span>;
    }
    for (let i = 0; i < range.length; i += 2) {
      const start = range[i];
      const end = range[i + 1];
      if (start > lastIndex) {
        parts.push(value.substring(lastIndex, start));
      }
      parts.push(
        <span
          key={i}
          className="font-bold"
          style={{ color: "var(--vscode-list-highlightForeground)" }}
        >
          {value.substring(start, end)}
        </span>,
      );
      lastIndex = end;
    }
    if (lastIndex < value.length) {
      parts.push(value.substring(lastIndex));
    }
    return parts;
  };

  return (
    <div
      className={`flex cursor-pointer flex-nowrap items-center justify-between gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm ${
        isSelected
          ? "bg-accent/30 text-foreground dark:bg-accent/80 dark:text-accent-foreground"
          : "hover:bg-muted/50"
      }`}
      {...rest}
      ref={ref}
    >
      <span className="mr-2 flex items-center gap-1 truncate whitespace-nowrap font-medium">
        <span className="truncate">{highlightedText()}</span>
      </span>
    </div>
  );
});
