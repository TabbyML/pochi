import { Fragment, type Schema, Slice } from "@tiptap/pm/model";

/**
 * Builds a ProseMirror slice from plain text, splitting on newlines into
 * separate paragraphs.
 *
 * This mirrors ProseMirror's own plain-text clipboard parsing so that pasting
 * content that also carries `text/html` (e.g. text copied from a rendered chat
 * message) preserves newlines instead of collapsing them the way HTML parsing
 * does.
 */
export function createPlainTextSlice(schema: Schema, text: string): Slice {
  const paragraphType = schema.nodes.paragraph;
  const paragraphs = text
    .split(/(?:\r\n?|\n)+/)
    .map((block) =>
      paragraphType.create(null, block ? schema.text(block) : null),
    );

  return new Slice(Fragment.fromArray(paragraphs), 1, 1);
}

/**
 * Decides whether a paste should be coerced to plain text.
 *
 * The prompt editor only supports plain text plus typed mention/slash nodes,
 * so HTML pastes (e.g. copied from a rendered chat message) are flattened to
 * text to preserve newlines instead of letting HTML parsing collapse them.
 *
 * The following pastes are intentionally left to ProseMirror's default
 * handling and are NOT flattened:
 * - pastes containing files (handled by the attachment paste handler);
 * - plain-text-only pastes (they already preserve newlines);
 * - content copied from within a ProseMirror editor, which ProseMirror marks
 *   with `data-pm-slice`, so structured nodes such as mentions survive a
 *   copy/paste round-trip.
 */
export function shouldPasteAsPlainText({
  text,
  html,
  hasFiles,
}: {
  text: string;
  html: string;
  hasFiles: boolean;
}): boolean {
  if (hasFiles) return false;
  // Plain-text-only pastes already keep newlines; only HTML pastes lose them.
  if (!text || !html) return false;
  // Preserve structured nodes (mentions, etc.) from in-editor copy/paste.
  if (html.includes("data-pm-slice")) return false;
  return true;
}

/**
 * Extracts basename and formats path for display
 */
export function formatPathForDisplay(filepath: string): {
  basename: string;
  displayPath: string;
} {
  // FIXME: hack way to handle both Unix and Windows paths
  const separator = filepath.includes("\\") ? "\\" : "/";
  const parts = filepath.split(separator);
  const basename = parts[parts.length - 1];

  // Format display path (excluding basename)
  const displayPath = parts.slice(0, -1).join(separator);

  return { basename, displayPath };
}
