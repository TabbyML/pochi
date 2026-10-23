import type { Root } from "hast";
import { visit } from "unist-util-visit";

type Raw = {
  type: "raw";
  value: string;
};

function createTagFilterExpression(tagNames: string[]): RegExp {
  const escapedTags = tagNames
    .map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(
    `<(/?)(?!/?(${escapedTags})(?=[\\t\\n\\f\\r />]))([^>]*)(?=[\\t\\n\\f\\r />])`,
    "gi",
  );
}

/**
 * Escape HTML tags that are not in tagNames
 */
export function customStripTagsPlugin({ tagNames }: { tagNames: string[] }) {
  const tagFilterExpression = createTagFilterExpression(tagNames);

  return (tree: Root) => {
    visit(tree, "raw", (node: Raw) => {
      node.value = node.value.replace(tagFilterExpression, "&lt;$1$2$3");
    });
    return tree;
  };
}
