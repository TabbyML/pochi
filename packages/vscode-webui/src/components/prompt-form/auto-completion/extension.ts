import { PluginKey } from "@tiptap/pm/state";
import { Extension, ReactRenderer } from "@tiptap/react";
import {
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
  type Trigger,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import { debounceWithCachedValue } from "@/lib/debounce";
import { vscodeHost } from "@/lib/vscode";

import { fuzzySearchStrings } from "@/lib/fuzzy-search";
import { fileMentionPluginKey } from "../context-mention/extension";
import type { MentionListActions } from "../shared";
import { workflowMentionPluginKey } from "../workflow-mention/extension";
import {
  type AutoCompleteListProps,
  AutoCompleteMentionList,
} from "./mention-list";

export const autoCompletePluginKey = new PluginKey("autoCompletion");

interface AutoCompleteSuggestionItem {
  value: string;
  range: number[] | null;
}

const createFuzzySearcher = () => {
  let lastQuery = "";
  let lastCandidates: AutoCompleteSuggestionItem[] = [];
  const debouncedListAutoCompleteCandidates = debounceWithCachedValue(
    async (messageContent?: string) => {
      lastQuery = "";
      const data = await vscodeHost.listAutoCompleteCandidates();
      if (messageContent) {
        data.push(...(messageContent.match(/[\w_]+/g) || []));
      }
      return [...new Set(data)].filter((item) => item.length > 2);
    },
    5_000,
    {
      leading: true,
    },
  );

  return async (
    query: string,
    messageContent?: string,
  ): Promise<AutoCompleteSuggestionItem[]> => {
    if (!query) return [];

    if (query === lastQuery) return lastCandidates;
    const candidates =
      await debouncedListAutoCompleteCandidates(messageContent);
    if (!candidates?.length) return [];
    lastQuery = query;
    // LIMIT to 2500 candidates
    lastCandidates = fuzzySearch(candidates.slice(0, 2500), query);
    return lastCandidates;
  };
};

const fuzzySearchAutoCompleteItems = createFuzzySearcher();

function fuzzySearch(
  items: Awaited<ReturnType<typeof vscodeHost.listAutoCompleteCandidates>>,
  query: string,
): AutoCompleteSuggestionItem[] {
  const fuzzyResult = fuzzySearchStrings(query, items);
  const result: AutoCompleteSuggestionItem[] = [];
  for (const i of fuzzyResult) {
    const value = items[i.idx];
    result.push({
      value,
      range: i.range,
    });
  }
  return result;
}

function findSuggestionMatch(config: Trigger) {
  const { $position } = config;
  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;
  const cursorPos = $position.pos;
  const match = text.match(/([a-zA-Z0-9-_]+)$/);
  if (!match) return null;
  const word = match[1];

  const from = cursorPos - word.length;
  const to = cursorPos;

  return {
    range: { from, to },
    query: word,
    text: word,
  };
}

interface AutoCompleteExtensionOptions {
  suggestion: Omit<
    SuggestionOptions<AutoCompleteSuggestionItem>,
    "editor" | "items" | "render"
  >;
  messageContent?: string;
}

export const AutoCompleteExtension = Extension.create<
  AutoCompleteExtensionOptions,
  {
    component: ReactRenderer<MentionListActions, AutoCompleteListProps> | null;
    popup: TippyInstance | null;
    showTimeout: number | null;
  }
>({
  name: "autoCompletion",

  addStorage() {
    return {
      component: null,
      popup: null,
      showTimeout: null,
    };
  },

  destroy() {
    if (this.storage.showTimeout) {
      clearTimeout(this.storage.showTimeout);
    }
    if (this.storage.popup) {
      this.storage.popup.destroy();
    }
    if (this.storage.component) {
      this.storage.component.destroy();
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const { allow: userAllow, ...suggestionOptions } =
      this.options.suggestion || {};

    const allow: SuggestionOptions<AutoCompleteSuggestionItem>["allow"] = (
      props,
    ) => {
      const suggestionState = autoCompletePluginKey.getState(
        props.editor.state,
      );
      if (suggestionState?.composing) {
        return false;
      }

      const fileMentionState = fileMentionPluginKey.getState(
        props.editor.state,
      );
      const workflowMentionState = workflowMentionPluginKey.getState(
        props.editor.state,
      );
      const isMentionActive =
        fileMentionState?.active || workflowMentionState?.active;

      if (isMentionActive) {
        return false;
      }

      if (userAllow) {
        return userAllow(props);
      }
      return true;
    };

    return [
      Suggestion<AutoCompleteSuggestionItem>({
        ...suggestionOptions,
        editor: this.editor,
        char: "",
        pluginKey: autoCompletePluginKey,
        items: ({ query }) =>
          fuzzySearchAutoCompleteItems(query, this.options.messageContent),
        command: ({ editor, range, props }) => {
          const label = props.value;
          editor.chain().focus().insertContentAt(range, `${label} `).run();
        },
        allow,
        render: () => {
          let latestProps: SuggestionProps<AutoCompleteSuggestionItem> | null =
            null;
          const fetchItems = async (query?: string) => {
            if (!query) return [];
            return fuzzySearchAutoCompleteItems(
              query,
              this.options.messageContent,
            );
          };

          const createMention = (
            props: SuggestionProps<AutoCompleteSuggestionItem>,
          ) => {
            storage.component = new ReactRenderer(AutoCompleteMentionList, {
              props: { ...props, fetchItems },
              editor: props.editor,
            });

            const clientRect = props.clientRect?.();
            if (!clientRect) return;

            storage.popup = tippy(document.body, {
              getReferenceClientRect: () => clientRect,
              appendTo: () => document.body,
              content: storage.component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "top-start",
              offset: [0, 6],
              maxWidth: "none",
            });
          };

          const destroyMention = () => {
            if (storage.showTimeout) {
              clearTimeout(storage.showTimeout);
              storage.showTimeout = null;
            }
            if (storage.popup) {
              if (!storage.popup.state.isDestroyed) {
                storage.popup.destroy();
              }
              storage.popup = null;
            }
            if (storage.component) {
              storage.component.destroy();
              storage.component = null;
            }
          };

          const showPopup = (
            props: SuggestionProps<AutoCompleteSuggestionItem>,
          ) => {
            createMention(props);
          };

          return {
            onStart: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              if (!props.items.length) return;
              latestProps = props;

              storage.showTimeout = window.setTimeout(() => {
                if (latestProps) {
                  showPopup(latestProps);
                }
                storage.showTimeout = null;
              }, 200);
            },
            onUpdate: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              latestProps = props;
              if (!props.items?.length) {
                destroyMention();
                return;
              }

              if (storage.showTimeout === null && storage.component === null) {
                showPopup(props);
              }
              storage.component?.updateProps(props);
            },
            onExit: () => {
              destroyMention();
            },
            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (props.event.key === "Escape") {
                destroyMention();
                return true;
              }
              return storage.component?.ref?.onKeyDown(props) ?? false;
            },
          };
        },
        findSuggestionMatch,
      }),
    ];
  },
});
