import { ScrollArea } from "@/components/ui/scroll-area";
import { FileIcon } from "@/features/tools";
import type { Editor, Range } from "@tiptap/react";
import { MessageSquare } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { MentionListActions } from "../shared";
import {
  useMentionItems,
  useMentionKeyboardNavigation,
  useScrollIntoView,
} from "../shared";
import { formatPathForDisplay } from "../utils";

// Types for mention items (only id and filepath)
export interface MentionItem {
  isDir: boolean;
  filepath: string;
}

// A past task with a stored transcript that can be referenced from the prompt
export interface TaskMentionItem {
  taskId: string;
  title?: string;
  updatedAt: number;
  filePath: string;
}

type MentionEntry =
  | { type: "file"; item: MentionItem }
  | { type: "task"; item: TaskMentionItem };

const NoTasks: TaskMentionItem[] = [];

// Before anything is typed, show a few entries of every group instead of
// letting the files fill the whole list.
const PreviewTotalCount = 8;
const PreviewTaskCount = 3;

export interface MentionListProps {
  items: MentionItem[];
  command: (item: {
    id: string;
    filepath: string;
  }) => void;
  editor: Editor;
  range: Range;
  query?: string;
  fetchItems?: (query?: string) => Promise<MentionItem[]>;
  fetchTasks?: (query?: string) => Promise<TaskMentionItem[]>;
  checkHasIssues?: () => Promise<boolean>;
  onSelectedIndexChange?: (index: number) => void;
}

/**
 * A React component for the mention dropdown list.
 * Displays when a user types '@...' and suggestions are fetched.
 */
export const MentionList = forwardRef<MentionListActions, MentionListProps>(
  (
    {
      items: initialItems,
      command,
      editor,
      range,
      query,
      fetchItems,
      fetchTasks,
      checkHasIssues,
      onSelectedIndexChange,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const allItems = useMentionItems(initialItems, query, fetchItems);
    const allTasks = useMentionItems(NoTasks, query, fetchTasks);
    const isPreview = !query?.trim();
    const tasks = useMemo(
      () => (isPreview ? allTasks.slice(0, PreviewTaskCount) : allTasks),
      [isPreview, allTasks],
    );
    const items = useMemo(
      () =>
        isPreview
          ? allItems.slice(0, PreviewTotalCount - tasks.length)
          : allItems,
      [isPreview, allItems, tasks.length],
    );
    // The "Files" group comes first, then the "Tasks" group
    const entries = useMemo<MentionEntry[]>(
      () => [
        ...items.map((item): MentionEntry => ({ type: "file", item })),
        ...tasks.map((item): MentionEntry => ({ type: "task", item })),
      ],
      [items, tasks],
    );
    const [hasIssues, setHasIssues] = useState(false);

    useEffect(() => {
      if (checkHasIssues) {
        checkHasIssues().then(setHasIssues);
      }
    }, [checkHasIssues]);

    // Reset selected index when items change to prevent out-of-bounds access
    useEffect(() => {
      if (selectedIndex >= entries.length) {
        setSelectedIndex(Math.max(0, entries.length - 1));
      }
    }, [entries.length, selectedIndex]);

    // Notify parent when selected index changes
    useEffect(() => {
      onSelectedIndexChange?.(selectedIndex);
    }, [selectedIndex, onSelectedIndexChange]);

    const handleSelect = useCallback(
      (entry: MentionEntry) => {
        if (entry.type === "file") {
          command({ id: entry.item.filepath, filepath: entry.item.filepath });
          return;
        }
        const { taskId, title, filePath } = entry.item;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "taskMention",
              attrs: { id: taskId, path: filePath, title: title ?? "" },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      [command, editor, range],
    );

    const keyboardNavigation = useMentionKeyboardNavigation(
      entries,
      selectedIndex,
      setSelectedIndex,
      handleSelect,
    );

    // `items` only exposes the files, which is what the editor previews
    useImperativeHandle(ref, () => ({
      ...keyboardNavigation,
      selectedIndex,
      items,
    }));

    return (
      <div className="relative flex w-[80vw] flex-col overflow-hidden py-1 sm:w-[600px]">
        {hasIssues && (
          <div className="mx-2 mb-1 px-2 py-1.5 text-muted-foreground text-xs">
            {t(
              "mentionList.useHashForIssues",
              "use # to search for github issues",
            )}
          </div>
        )}
        <ScrollArea viewportClassname="max-h-[300px] px-2">
          {entries.length === 0 ? (
            <div className="px-2 py-1.5 text-muted-foreground text-xs">
              {query
                ? t("mentionList.noResultsFound")
                : t("mentionList.typeToSearch")}
            </div>
          ) : (
            <div className="grid gap-0.5">
              {items.length > 0 && (
                <div className="px-2 pt-1 pb-1 text-muted-foreground text-xs">
                  {t("mentionList.files")}
                </div>
              )}
              {items.map((item, index) => (
                <MentionItemView
                  key={item.filepath}
                  onClick={() => handleSelect({ type: "file", item })}
                  isSelected={index === selectedIndex}
                  data={item}
                />
              ))}
              {tasks.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-muted-foreground text-xs">
                  {t("mentionList.tasks")}
                </div>
              )}
              {tasks.map((item, index) => (
                <TaskItemView
                  key={item.taskId}
                  onClick={() => handleSelect({ type: "task", item })}
                  isSelected={items.length + index === selectedIndex}
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

MentionList.displayName = "MentionList";

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
  const { basename, displayPath } = formatPathForDisplay(data.filepath);

  return (
    <div
      className={`flex cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
      }`}
      title={data.filepath}
      {...rest}
      ref={ref}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        <FileIcon isDirectory={data.isDir} path={data.filepath} />
      </div>
      <span className="mr-2 ml-1 truncate whitespace-nowrap font-medium ">
        {basename}
      </span>
      <span className="flex-1 truncate text-muted-foreground text-xs">
        {displayPath}
      </span>
    </div>
  );
});

interface TaskItemViewProps {
  isSelected: boolean;
  data: TaskMentionItem;
  onClick: () => void;
}

const TaskItemView = memo(function TaskItemView({
  isSelected,
  data,
  ...rest
}: TaskItemViewProps) {
  const { t } = useTranslation();
  const ref = useScrollIntoView(isSelected);
  const title = data.title?.trim() || t("mentionList.untitledTask");

  return (
    <div
      className={`flex cursor-pointer flex-nowrap items-center gap-1 overflow-hidden rounded-md px-2 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
      }`}
      title={title}
      {...rest}
      ref={ref}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        <MessageSquare className="size-3.5" />
      </div>
      <span className="mr-2 ml-1 flex-1 truncate whitespace-nowrap font-medium">
        {title}
      </span>
      <span className="shrink-0 text-muted-foreground text-xs">
        {new Date(data.updatedAt).toLocaleDateString()}
      </span>
    </div>
  );
});
