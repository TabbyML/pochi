import { prompts } from "@getpochi/common";
import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/**
 * A React component to render a slash command node in the editor.
 * Displays the slash command with a / symbol in a highlighted style.
 */
export const SlashComponent = (props: NodeViewProps) => {
  const { node } = props;
  const { id } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="rounded-sm px-1">
      <span className="space-x-0.5 rounded bg-muted box-decoration-clone px-1.5 py-0.5 align-middle font-medium text-foreground text-sm">
        /{id}
      </span>
    </NodeViewWrapper>
  );
};

// Create a unique plugin key for slash command suggestions
export const SlashMentionPluginKey = new PluginKey("slashMentionPluginKey");

/**
 * A custom TipTap extension to handle slash commands (like /agent-name).
 */
export const PromptFormSlashExtension = Mention.extend({
  name: "slashMention",
  addNodeView() {
    return ReactNodeViewRenderer(SlashComponent);
  },

  renderText({ node }) {
    const { type, id, path } = node.attrs;
    if (type === "custom-agent") {
      return prompts.customAgent(id, path);
    }
    if (type === "skill") {
      return prompts.skill(id, path);
    }
    return "";
  },

  addAttributes() {
    return {
      type: {
        default: "",
      },
      id: {
        default: "",
      },
      label: {
        default: "",
      },
      path: {
        default: "",
      },
      rawData: {
        default: {},
      },
    };
  },
});
