import type { Parent, Root, Text } from "hast";
import { toText } from "hast-util-to-text";
import { rehype } from "rehype";
import { constants } from "../base";

function escapeUnknownXMLTags(message: string): string {
  const tagRegex = /<\/?([^\s>]+)[^>]*>/g;

  return message.replace(tagRegex, (match, tagName) => {
    if (constants.KnownTags.includes(tagName)) {
      return match; // Keep known tags as is
    }
    return match.replace("<", "&lt;"); // Escape unknown tags
  });
}

export function parseTitle(title: string | null) {
  if (!title?.trim()) return "(Untitled)";
  return parseMarkdown(title).slice(0, 256) || "(Untitled)";
}

export function parseMarkdown(content: string) {
  const formatXMLTags = (ast: Root) => {
    function processNode(node: Parent) {
      if (node.children) {
        for (const child of node.children) {
          if (
            child.type === "element" &&
            (child.tagName === "custom-agent" || child.tagName === "skill")
          ) {
            const _child = child as unknown as Text;
            _child.type = "text";
            _child.value = `/${child.properties.id}`;
            child.children = [];
          }
          if (
            child.type === "element" &&
            (child.tagName === "file" || child.tagName === "issue")
          ) {
            child.tagName = "span";
          }
        }

        for (const child of node.children) {
          processNode(child as Parent);
        }
      }
    }

    processNode(ast);
  };

  const hast = rehype().parse(escapeUnknownXMLTags(content));
  formatXMLTags(hast);
  return toText(hast);
}
