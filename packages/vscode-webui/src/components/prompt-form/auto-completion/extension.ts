import { ClientTools } from "@getpochi/tools";
import uFuzzy from "@leeoniya/ufuzzy";
import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import {
  Suggestion,
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
  type Trigger,
} from "@tiptap/suggestion";
import { filter, map, pipe, unique } from "remeda";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import { debounceWithCachedValue } from "@/lib/debounce";
import { fetchMcpStatus } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";

import { fileMentionPluginKey } from "../context-mention/extension";
import type { MentionListActions } from "../shared";
import { workflowMentionPluginKey } from "../workflow-mention/extension";
import {
  type AutoCompleteListProps,
  AutoCompleteMentionList,
} from "./mention-list";

export const autoCompletePluginKey = new PluginKey("autoCompletion");

const AllTools = Object.entries({ ...ClientTools }).map(([id]) => ({
  label: id,
}));

const debouncedListMcpConnections = debounceWithCachedValue(
  async () => {
    try {
      const data = await fetchMcpStatus().then((x) => x.toJSON());
      if (!data?.connections) return [];

      return pipe(
        data.connections,
        (obj: Record<string, { status: string }>) => Object.entries(obj),
        filter(([_k, v]) => v.status === "ready"),
        map(([key]) => key),
      );
    } catch {
      return [];
    }
  },
  1000 * 60, // 1 minute
  {
    leading: true,
  },
);

const debouncedListSymbols = debounceWithCachedValue(
  async (query: string) => {
    const symbols = await vscodeHost.listSymbolsInWorkspace({
      query,
      limit: 20,
    });
    return {
      symbols,
    };
  },
  300,
  {
    leading: true,
  },
);

interface AutoCompleteSuggestionItem {
  value: {
    label: string;
    type: string;
  };
  ranges: number[];
}

const fuzzySearchAutoCompleteItems = async (
  query: string,
): Promise<AutoCompleteSuggestionItem[]> => {
  if (!query) return [];

  const [symbolsData, mcpsData] = await Promise.all([
    debouncedListSymbols(query),
    debouncedListMcpConnections(),
  ]);

  const buildInTools = AllTools.map((x) => x.label);
  const symbols = symbolsData?.symbols?.length
    ? pipe(
        symbolsData.symbols,
        map((x: { label: string }) => x.label),
        unique(),
      )
    : [];
  const mcps = mcpsData || [];

  return [
    ...fuzzySearch("tool", buildInTools, query),
    ...fuzzySearch("mcp", mcps, query),
    ...fuzzySearch("symbol", symbols, query),
  ];
};

const ufInstance = new uFuzzy({
  intraChars: "[a-z\\d'\\-_./]",
  interSplit: "[^a-zA-Z\\d'\\-_./]+",
});
function fuzzySearch(
  type: string,
  items: string[],
  query: string,
): AutoCompleteSuggestionItem[] {
  const [_, info, order] = ufInstance.search(items, query);
  if (!order) return [];
  const results: AutoCompleteSuggestionItem[] = [];
  for (const i of order) {
    const item = items[info.idx[i]];
    const ranges = info.ranges[i];
    results.push({
      value: {
        label: item,
        type,
      },
      ranges,
    });
  }
  return results;
}

function findSuggestionMatch(config: Trigger) {
  const { $position } = config;
  const text = $position.nodeBefore?.isText && $position.nodeBefore.text;
  if (!text) return null;

  const cursorPos = $position.pos;
  const match = text.match(/(\w+)$/);
  if (!match) return null;
  const word = match[1];
  if (word.startsWith("/") || word.startsWith("@")) return null;
  if (!/^\w+$/.test(word)) return null;

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
}

export const AutoCompleteExtension = Extension.create<
  AutoCompleteExtensionOptions,
  { hasSelect: boolean }
>({
  name: "autoCompletion",

  addStorage() {
    return {
      hasSelect: false,
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const { allow: userAllow, ...suggestionOptions } =
      this.options.suggestion || {};

    const allow: SuggestionOptions<AutoCompleteSuggestionItem>["allow"] = (
      props,
    ) => {
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
        items: ({ query }) => fuzzySearchAutoCompleteItems(query),
        command: ({ editor, range, props }) => {
          const label = props.value.label;
          editor.chain().focus().insertContentAt(range, label).run();
          storage.hasSelect = true;
        },
        allow,
        render: () => {
          let component: ReactRenderer<
            MentionListActions,
            AutoCompleteListProps
          >;
          let popup: TippyInstance;

          const fetchItems = async (query?: string) => {
            if (!query) return [];
            return fuzzySearchAutoCompleteItems(query);
          };

          const destroyMention = () => {
            if (popup) popup.destroy();
            if (component) component.destroy();
          };

          return {
            onStart: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              storage.hasSelect = false;
              if (!props.items.length) return;

              component = new ReactRenderer(AutoCompleteMentionList, {
                props: { ...props, fetchItems },
                editor: props.editor,
              });

              const clientRect = props.clientRect?.();
              if (!clientRect) return;

              popup = tippy(document.body, {
                getReferenceClientRect: () => clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "top-start",
                offset: [0, 6],
                maxWidth: "none",
              });
            },
            onUpdate: (props: SuggestionProps<AutoCompleteSuggestionItem>) => {
              if (!props.items.length || storage.hasSelect) {
                destroyMention();
                return;
              }
              storage.hasSelect = false;
              component.updateProps(props);
            },
            onExit: () => {
              destroyMention();
            },
            onKeyDown: (props: SuggestionKeyDownProps): boolean => {
              if (props.event.key === "Escape") {
                destroyMention();
                return true;
              }
              return component.ref?.onKeyDown(props) ?? false;
            },
          };
        },
        findSuggestionMatch,
      }),
    ];
  },
});
