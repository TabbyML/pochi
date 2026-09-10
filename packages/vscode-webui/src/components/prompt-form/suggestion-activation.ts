import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";

const textUpdatePluginKey = new PluginKey<boolean>("textUpdate");

/**
 * Tracks whether the latest transaction changed the document (typing, deleting,
 * pasting, inserting a node) or only moved the caret. Transactions that do
 * neither keep the previous value.
 */
const textUpdatePlugin = new Plugin<boolean>({
  key: textUpdatePluginKey,
  state: {
    init: () => false,
    apply: (tr, prev) => {
      // `docChanged` must be checked first: text input sets both flags.
      if (tr.docChanged) {
        return true;
      }
      if (tr.selectionSet) {
        return false;
      }
      // Metadata only transactions (async item fetches, forced updates, ...)
      // keep the previous value so open popups are not closed by them.
      return prev;
    },
  },
});

/**
 * Provides the state read by {@link createMentionSuggestionAllow}.
 *
 * ProseMirror computes plugin state fields in plugin order, and a field is only
 * readable once it has been computed. The high `priority` therefore matters:
 * tiptap sorts extensions by priority (descending) before collecting their
 * plugins, so this plugin always runs before the suggestion plugins of the
 * mention extensions (`@tiptap/extension-mention` uses `priority: 101`),
 * independently of the order of the `extensions` array.
 */
export const TextUpdateTrackerExtension = Extension.create({
  name: "textUpdateTracker",
  priority: 1000,
  addProseMirrorPlugins() {
    return [textUpdatePlugin];
  },
});

/**
 * Builds a `suggestion.allow` callback that blocks activation when the caret
 * moved without the document changing, so that arrow keys and clicks dismiss
 * the popup even when the query below the caret still matches. Document changes
 * activate, metadata only transactions keep whatever the previous transaction
 * decided, and an ongoing IME composition always activates.
 *
 * @param nodeName name of the mention node the suggestion inserts.
 */
export function createMentionSuggestionAllow(
  nodeName: string,
): NonNullable<SuggestionOptions["allow"]> {
  return ({ editor, state, range }) => {
    // `state` is the state being built, while `editor.state` still is the
    // previous one and would therefore lag one transaction behind.
    if (!textUpdatePluginKey.getState(state) && !editor.view.composing) {
      return false;
    }

    // Preserves the default `allow` of @tiptap/extension-mention, which is
    // replaced as soon as `suggestion.allow` is configured.
    const $from = state.doc.resolve(range.from);
    const type = state.schema.nodes[nodeName];
    return !!$from.parent.type.contentMatch.matchType(type);
  };
}
