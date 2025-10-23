import { prompts } from "@getpochi/common";
import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

/**
 * A React component to render a workflow node in the editor.
 * Displays the workflow with a / symbol in a highlighted style.
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

// Create a unique plugin key for workflow suggestions
export const SlashMentionPluginKey = new PluginKey("workflowMentionPluginKey");

/**
 * A custom TipTap extension to handle workflows (like /workflow-name).
 */
export const PromptFormSlashExtension = Mention.extend({
  name: "slashMention",
  addNodeView() {
    return ReactNodeViewRenderer(SlashComponent);
  },

  renderText({ node }) {
    const { type, id, path, rawData } = node.attrs;
    if (type === "workflow") {
      const loadedContent: string = rawData.content || `error loading ${type}`;
      console.log(rawData);
      return prompts.workflow(id, path, loadedContent);
    }
    if (type === "custom-agent") {
      return prompts.customAgent(id, path);
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
