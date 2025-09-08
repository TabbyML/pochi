import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { useLayoutEffect, useRef, useState } from "react";

export interface MentionListActions {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/**
 * Custom hook for keyboard navigation in mention lists
 */
export function useMentionKeyboardNavigation<T>(
  items: T[],
  selectedIndex: number,
  setSelectedIndex: (index: number) => void,
  handleSelect: (item: T) => void,
) {
  return {
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      const lastIndex = items.length - 1;
      let newIndex = selectedIndex;

      switch (event.key) {
        case "ArrowUp":
          newIndex = selectedIndex === 0 ? lastIndex : selectedIndex - 1;
          break;
        case "ArrowDown":
          newIndex = selectedIndex === lastIndex ? 0 : selectedIndex + 1;
          break;
        case "Enter":
        case "Tab":
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex]);
          }
          return true;
        default:
          return false;
      }

      setSelectedIndex(newIndex);
      return true;
    },
  };
}

/**
 * Custom hook for fetching items in mention lists
 */
export function useMentionItems<T>(
  initialItems: T[],
  query: string | undefined,
  fetchItems?: (query?: string) => Promise<T[]>,
) {
  const [items, setItems] = useState<T[]>(initialItems);

  useLayoutEffect(() => {
    let active = true;
    if (fetchItems) {
      const fetch = async () => {
        const newItems = await fetchItems(query);
        if (active) setItems(newItems);
      };
      fetch();
    } else {
      setItems(initialItems);
    }
    return () => {
      active = false;
    };
  }, [fetchItems, query, initialItems]);

  return items;
}

/**
 * Custom hook for scroll-into-view behavior for selected items
 */
export function useScrollIntoView(isSelected: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (isSelected && ref.current) {
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "auto",
        });
      });
    }
  }, [isSelected]);

  return ref;
}
