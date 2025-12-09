import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
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
});
