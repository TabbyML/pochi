import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { VscIssues } from "react-icons/vsc";
import type { MentionListActions } from "../shared";
import {
  useMentionItems,
  useMentionKeyboardNavigation,
  useScrollIntoView,
} from "../shared";

interface MentionItem {
  id: string;
  title: string;
  url: string;
}

export interface IssueMentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
  query?: string;
  fetchItems?: (query?: string) => Promise<MentionItem[]>;
}

export const IssueMentionList = forwardRef<
  MentionListActions,
  IssueMentionListProps
>(({ items: initialItems, command, query, fetchItems }, ref) => {
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
    <div className="relative flex w-[80vw] flex-col overflow-hidden py-1 sm:w-[600px]">
      <ScrollArea viewportClassname="max-h-[300px] px-2">
        {items.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground text-xs">
            {query
              ? t("mentionList.noResultsFound")
              : t("mentionList.typeToSearch")}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {items.map((item, index) => (
              <IssueMentionItemView
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
});

IssueMentionList.displayName = "IssueMentionList";

interface IssueMentionItemViewProps {
  isSelected: boolean;
  data: MentionItem;
  onClick: () => void;
}

const IssueMentionItemView = memo(function IssueMentionItemView({
  isSelected,
  data,
  ...rest
}: IssueMentionItemViewProps) {
  const ref = useScrollIntoView(isSelected);

  return (
    <div
      className={cn(
        "flex cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
      )}
      {...rest}
      ref={ref}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        <VscIssues className="size-3.5" />
      </div>
      <span className="mr-2 ml-1 truncate whitespace-nowrap font-medium ">
        #{data.id}
      </span>
      <span className="flex-1 truncate text-muted-foreground text-xs">
        {data.title}
      </span>
    </div>
  );
});
