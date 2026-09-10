import Mention from "@tiptap/extension-mention";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/**
 * A React component to render a mention node in the editor.
 * Displays the mention with an @ symbol in a highlighted style.
 */
export const MentionComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { filepath } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="rounded-sm px-1">
      <span className="space-x-0.5 rounded bg-muted box-decoration-clone px-1.5 py-0.5 align-middle font-medium text-foreground text-sm">
        {filepath}
      </span>
    </NodeViewWrapper>
  );
};

export const fileMentionPluginKey = new PluginKey("fileMentionPluginKey");
export const fileMentionPreviewPluginKey = new PluginKey(
  "fileMentionPreviewPluginKey",
);

/**
 * A custom TipTap extension to handle mentions (like @name).
 */
export const PromptFormMentionExtension = Mention.extend({
  name: "fileMention",
  // Uses ReactNodeViewRenderer for custom node rendering
  addNodeView() {
    return ReactNodeViewRenderer(MentionComponent);
  },

  // When exported as plain text, use XML tag format
  renderText({ node }) {
    return `<file>${node.attrs.filepath}</file>`;
  },

  // Defines custom attributes for the mention node
  addAttributes() {
    return {
      id: {
        default: null,
      },
      filepath: {
        default: "",
      },
    };
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];

    return [
      ...parentPlugins,
      new Plugin({
        key: fileMentionPreviewPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            // Get meta data from transaction
            const metaData = tr.getMeta(fileMentionPreviewPluginKey);

            // If there's meta data, process it
            if (metaData !== undefined) {
              // Clear decorations if the transaction has a meta flag to clear
              if (metaData === "clear") {
                return DecorationSet.empty;
              }

              // Get preview data from transaction meta
              if (
                typeof metaData === "object" &&
                metaData.filepath &&
                metaData.pos != null
              ) {
                // Create a widget decoration at the specified position
                const widget = Decoration.widget(
                  metaData.pos,
                  () => {
                    const span = document.createElement("span");
                    span.className =
                      "text-muted-foreground text-sm ml-2 select-none";
                    span.setAttribute("contenteditable", "false");
                    span.dataset.fileMentionPreview = "";
                    span.textContent = metaData.filepath;
                    return span;
                  },
                  { side: 1 },
                );
                return DecorationSet.create(tr.doc, [widget]);
              }
            }

            // Map decorations through document changes only if no meta data
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleKeyDown(view, event) {
            if (
              event.key !== "ArrowRight" ||
              event.isComposing ||
              view.composing ||
              !view.state.selection.empty
            ) {
              return false;
            }

            const pos = view.state.selection.from;
            const previewAtCaret = this.getState(view.state)
              ?.find(pos, pos)
              .some((decoration) => decoration.from === pos);
            if (!previewAtCaret) {
              return false;
            }

            // Close the suggestion and preview without consuming ArrowRight.
            view.dispatch(
              view.state.tr
                .setSelection(view.state.selection)
                .setMeta(fileMentionPreviewPluginKey, "clear"),
            );
            return false;
          },
        },
      }),
    ];
  },
});
