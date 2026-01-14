import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/**
 * A React component to render an issue mention node in the editor.
 * Displays the mention with a # symbol in a highlighted style.
 */
export const IssueMentionComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { id, title } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="rounded-sm px-1">
      <span
        title={title}
        className="space-x-0.5 rounded bg-muted box-decoration-clone px-1.5 py-0.5 align-middle font-medium text-foreground text-sm"
      >
        #{id}
      </span>
    </NodeViewWrapper>
  );
};

export const issueMentionPluginKey = new PluginKey("issueMentionPluginKey");

/**
 * A custom TipTap extension to handle issue mentions (like #123).
 */
export const PromptFormIssueMentionExtension = Mention.extend({
  name: "issueMention",
  // Uses ReactNodeViewRenderer for custom node rendering
  addNodeView() {
    return ReactNodeViewRenderer(IssueMentionComponent);
  },

  // When exported as plain text, use XML tag format
  renderText({ node }) {
    return `<issue id="${node.attrs.id}" url="${node.attrs.url}" title="${node.attrs.title}">#${node.attrs.id}</issue>`;
  },

  // Defines custom attributes for the mention node
  addAttributes() {
    return {
      id: {
        default: null,
      },
      title: {
        default: "",
      },
      url: {
        default: "",
      },
    };
  },
});
