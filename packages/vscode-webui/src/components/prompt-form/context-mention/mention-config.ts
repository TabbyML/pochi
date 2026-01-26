import { getLogger } from "@getpochi/common";
import { type Editor, type Range, ReactRenderer } from "@tiptap/react";
import type {
  SuggestionMatch,
  SuggestionOptions,
  Trigger,
} from "@tiptap/suggestion";
import { findSuggestionMatch } from "@tiptap/suggestion";
import tippy from "tippy.js";
import type { MentionListActions } from "../shared";
import { fileMentionPluginKey, fileMentionPreviewPluginKey } from "./extension";
import { MentionList, type MentionListProps } from "./mention-list";

const logger = getLogger("mention-config");

interface CreateFileMentionConfigOptions<T extends { filepath: string }> {
  fetchItems: (query?: string) => Promise<T[]>;
  checkHasIssues: () => Promise<boolean>;
}

export function createFileMentionConfig<T extends { filepath: string }>({
  fetchItems,
  checkHasIssues,
}: CreateFileMentionConfigOptions<T>) {
  let isFileMentionComposing = false;

  const render: SuggestionOptions["render"] = () => {
    let component: ReactRenderer<MentionListActions, MentionListProps> | null =
      null;
    let popup: Array<{ destroy: () => void; hide: () => void }>;
    let currentRange: Range | null = null;
    let currentEditor: Editor | null = null;
    let isActive = false;

    const updateIsComposingRef = (v: boolean) => {
      isFileMentionComposing = v;
    };

    const destroyMention = () => {
      if (popup?.[0]) {
        popup[0].destroy();
      }
      if (component) {
        component.destroy();
      }

      clearPreview(currentEditor);

      updateIsComposingRef(false);
      isActive = false;
    };

    const updatePreview = (editor: Editor, range: Range) => {
      // Only update preview when mention dropdown is active
      if (!isActive || !component || !component.ref || !editor || !range)
        return;

      const selectedIndex = component.ref.selectedIndex ?? 0;
      const items = (component.ref.items as T[]) ?? [];
      const selectedItem = items[selectedIndex];

      // Only show preview if there are items and a selected item exists
      if (items.length > 0 && selectedItem && selectedItem.filepath) {
        // Update decoration to show preview
        const tr = editor.state.tr;
        tr.setMeta(fileMentionPreviewPluginKey, {
          filepath: selectedItem.filepath,
          pos: range.to,
        });
        editor.view.dispatch(tr);
      } else {
        // Clear preview if no items
        clearPreview(editor);
      }
    };

    const clearPreview = (editor: Editor | null) => {
      if (!editor) {
        return;
      }
      try {
        // Clear preview decoration
        const tr = editor.state.tr;
        tr.setMeta(fileMentionPreviewPluginKey, "clear");
        editor.view.dispatch(tr);
      } catch (error) {
        logger.error("Error clearing preview:", error);
      }
    };

    const onSelectedIndexChange = () => {
      if (isActive && currentEditor && currentRange && component) {
        updatePreview(currentEditor, currentRange);
      }
    };

    return {
      onStart: (props) => {
        updateIsComposingRef(props.editor.view.composing);
        currentEditor = props.editor;
        currentRange = props.range;
        isActive = true;

        component = new ReactRenderer(MentionList, {
          props: {
            ...props,
            fetchItems,
            checkHasIssues,
            onSelectedIndexChange,
          },
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "top-start",
          offset: [0, 6],
          maxWidth: "none",
          onHide() {
            clearPreview(currentEditor);
          },
          onDestroy: () => {
            clearPreview(currentEditor);
          },
        });

        // Initial preview update - delayed to ensure component is ready
        setTimeout(() => {
          if (isActive && component) {
            updatePreview(props.editor, props.range);
          }
        }, 50);
      },
      onUpdate: (props) => {
        updateIsComposingRef(props.editor.view.composing);
        currentEditor = props.editor;
        currentRange = props.range;

        if (component) {
          component.updateProps({
            ...props,
            onSelectedIndexChange,
          });

          // Update preview with the currently selected item
          setTimeout(() => {
            if (isActive && component) {
              updatePreview(props.editor, props.range);
            }
          }, 0);
        }
      },
      onExit: () => {
        isActive = false;
        destroyMention();
        currentEditor = null;
        currentRange = null;
        component = null;
      },
      onKeyDown: (props) => {
        props.event.isComposing;
        if (props.event.key === "Escape") {
          isActive = false;
          destroyMention();
          currentEditor = null;
          currentRange = null;
          component = null;
          return true;
        }

        const result = component?.ref?.onKeyDown(props) ?? false;

        // Preview will be updated automatically via onSelectedIndexChange callback

        return result;
      },
    };
  };

  const findSuggestionMatchFn = (config: Trigger): SuggestionMatch => {
    const match = findSuggestionMatch({
      ...config,
      allowSpaces: isFileMentionComposing,
    });
    if (match?.query.startsWith("#")) {
      return null;
    }
    return match;
  };

  const items = async ({ query }: { query?: string }) => {
    return fetchItems(query ?? "");
  };

  return {
    suggestion: {
      char: "@",
      pluginKey: fileMentionPluginKey,
      items,
      render,
      findSuggestionMatch: findSuggestionMatchFn,
    },
  };
}
