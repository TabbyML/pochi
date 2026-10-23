import { type TaskReference, serializeTaskReference } from "@getpochi/common";
import {
  Node,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
} from "@tiptap/react";
import { MessageSquare } from "lucide-react";

/**
 * A React component to render a task reference node in the editor.
 */
export const TaskMentionComponent = (props: NodeViewProps) => {
  const { id, title } = props.node.attrs;

  return (
    <NodeViewWrapper as="span" className="rounded-sm px-1" data-task-id={id}>
      <span
        title={title}
        className="space-x-0.5 rounded bg-muted box-decoration-clone px-1.5 py-0.5 align-middle font-medium text-foreground text-sm"
      >
        <MessageSquare className="mr-1 inline size-3.5 align-text-bottom" />
        {title}
      </span>
    </NodeViewWrapper>
  );
};

/**
 * An inline node referencing an earlier task. It has no suggestion of its own:
 * the node is inserted from the `@` file mention list.
 */
export const PromptFormTaskMentionExtension = Node.create({
  name: "taskMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    const attribute = (name: "id" | "path" | "title") => ({
      default: "",
      parseHTML: (element: HTMLElement) =>
        element.getAttribute(`data-${name}`) ?? "",
      renderHTML: (attributes: Record<string, string>) => ({
        [`data-${name}`]: attributes[name],
      }),
    });
    return {
      id: attribute("id"),
      path: attribute("path"),
      title: attribute("title"),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskMentionComponent);
  },

  parseHTML() {
    return [{ tag: 'span[data-type="task-mention"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "task-mention" }, HTMLAttributes),
      node.attrs.title,
    ];
  },

  // When exported as plain text, use the XML tag format expanded by formatters.llm
  renderText({ node }) {
    return serializeTaskReference(node.attrs as TaskReference);
  },
});
