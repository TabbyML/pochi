import type { ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension, ReactRenderer } from "@tiptap/react";
import {
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
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

const suggestionTriggerPluginKey = new PluginKey("suggestionTrigger");

const suggestionTriggerPlugin = new Plugin({
  key: suggestionTriggerPluginKey,
  state: {
    init: () => false,
    apply: (tr, was) => {
      if (tr.getMeta("autoCompleteOpen")) {
        return true;
      }

      // Reset state when the suggestion is closed (e.g., by selecting an item, pressing Esc) or an item is applied.
      if (tr.getMeta("autoCompleteClose")) {
        return false;
      }

      // For other transactions that don't affect the suggestion, keep the previous state.
      return was;
    },
  },
  props: {
    handleKeyDown(view, event) {
      if (event.key === "Tab") {
        const { state } = view;
        if (
          autoCompletePluginKey.getState(state)?.active ||
          isMentionExtensionActive(state)
        ) {
          return false;
        }

        const { $from: $position } = state.selection;
        const match = getCurrentWordMatch($position);
        if (!match) return false;

        // If we have a match, we trigger the suggestion.
        event.preventDefault();
        // By inserting and then deleting a character, we can trick the suggestion plugin into re-evaluating.
        // This is because it only triggers on `docChanged` or `selectionSet` transactions.
        const { from, to } = state.selection;
        const tr = view.state.tr
          .insertText(" ", from, to)
          .delete(from, from + 1)
          .setMeta("autoCompleteOpen", true);
        view.dispatch(tr);
        return true;
      }
      if (event.key === "Escape") {
        const { state } = view;
        const isAutoCompleteActive =
          autoCompletePluginKey.getState(state)?.active;
        if (!isAutoCompleteActive && !isMentionExtensionActive(state)) {
          view.dom.blur();
          return true;
        }
      }
      return false;
    },
  },
});

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

function getCurrentWordMatch($position: ResolvedPos) {
  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;
  return text.match(/([a-zA-Z0-9-_]+)$/);
}

function findSuggestionMatch(config: { $position: ResolvedPos }) {
  const { $position } = config;
  const match = getCurrentWordMatch($position);
  if (!match) return null;

  const cursorPos = $position.pos;
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
  onHintVisibilityChange?: (visible: boolean) => void;
}

export const AutoCompleteExtension = Extension.create<
  AutoCompleteExtensionOptions,
  {
    component: ReactRenderer<MentionListActions, AutoCompleteListProps> | null;
    popup: TippyInstance | null;
  }
>({
  name: "autoCompletion",

  addStorage() {
    return {
      component: null,
      popup: null,
    };
  },

  destroy() {
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
      const shouldTriggerSuggestion = suggestionTriggerPluginKey.getState(
        props.editor.state,
      );
      // The suggestion is triggered by selection changes, but we only want to
      // show it when the document has changed.
      if (!shouldTriggerSuggestion) {
        return false;
      }

      const suggestionState = autoCompletePluginKey.getState(
        props.editor.state,
      );
      if (suggestionState?.composing) {
        return false;
      }

      if (isMentionExtensionActive(props.editor.state)) {
        return false;
      }
      if (userAllow) {
        return userAllow(props);
      }
      return true;
    };

    return [
      suggestionTriggerPlugin,
      createHintPlugin({
        onHintVisibilityChange: this.options.onHintVisibilityChange,
      }),
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
            if (isMentionExtensionActive(props.editor.state)) {
              return;
            }

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
              maxWidth: "70vw",
            });
          };

          const destroyMention = () => {
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
            this.editor.view.dispatch(
              this.editor.view.state.tr.setMeta("autoCompleteClose", true),
            );
          };

          return {
            onStart: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              createMention(props);
            },
            onUpdate: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              storage.component?.updateProps(props);
            },
            onExit: () => {
              destroyMention();
            },
            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (props.event.key === "Escape") {
                destroyMention();
                this.editor.view.dispatch(
                  this.editor.view.state.tr.setMeta("autoCompleteCancel", true),
                );
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

function isMentionExtensionActive(state: EditorState) {
  const fileMentionState = fileMentionPluginKey.getState(state);
  const workflowMentionState = workflowMentionPluginKey.getState(state);
  return fileMentionState?.active || workflowMentionState?.active;
}

const hintPluginKey = new PluginKey("hint");

function createHintPlugin(options: {
  onHintVisibilityChange?: (visible: boolean) => void;
}) {
  let searchVersion = 0;
  let isHintVisible = false;
  let showHintTimeout: ReturnType<typeof setTimeout> | undefined;

  const showHint = () => {
    if (isHintVisible) return;
    isHintVisible = true;
    options.onHintVisibilityChange?.(true);
  };

  const debouncedShowHint = () => {
    clearTimeout(showHintTimeout);
    showHintTimeout = setTimeout(showHint, 300);
  };

  const hideHint = () => {
    clearTimeout(showHintTimeout);
    if (!isHintVisible) return;
    isHintVisible = false;
    options.onHintVisibilityChange?.(false);
  };

  return new Plugin({
    key: hintPluginKey,
    state: {
      init: () => ({ active: false }),
      apply: (tr, value) => {
        if (tr.getMeta("autoCompleteCancel")) {
          return { active: true };
        }
        if (tr.docChanged) {
          return { active: true };
        }
        if (tr.selectionSet) {
          return { active: false };
        }
        return value;
      },
    },
    view: () => {
      return {
        update: async (view) => {
          if (!view.hasFocus()) {
            hideHint();
            return;
          }
          const currentPluginState = hintPluginKey.getState(view.state);
          if (
            !currentPluginState.active ||
            autoCompletePluginKey.getState(view.state)?.active ||
            isMentionExtensionActive(view.state)
          ) {
            hideHint();
            return;
          }

          const match = findSuggestionMatch({
            $position: view.state.selection.$from,
          });
          if (!match || !match.query) {
            hideHint();
            return;
          }

          const version = ++searchVersion;
          const items = await fuzzySearchAutoCompleteItems(match.query);

          if (version !== searchVersion) {
            return;
          }

          if (items.length > 0) {
            debouncedShowHint();
          } else {
            hideHint();
          }
        },
        destroy: () => {
          hideHint();
        },
      };
    },
  });
}
