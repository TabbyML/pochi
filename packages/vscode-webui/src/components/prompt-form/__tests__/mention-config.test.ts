import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileMentionConfig } from "../context-mention/mention-config";

// The mention list imports the host bridge, which needs a real webview.
vi.mock("@/lib/vscode", () => ({ vscodeHost: {} }));

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

/** Runs the file mention matcher with the caret at the end of `text`. */
function matchAtEnd(text: string, hasTaskMatch?: (query: string) => boolean) {
  editor = new Editor({
    extensions: [Document, Paragraph, Text],
    // JSON content: HTML parsing would collapse a trailing space.
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  });
  const { suggestion } = createFileMentionConfig({
    fetchItems: async () => [],
    hasTaskMatch,
    checkHasIssues: async () => false,
  });
  const pos = editor.state.doc.content.size - 1;
  return suggestion.findSuggestionMatch({
    char: "@",
    allowSpaces: false,
    allowToIncludeChar: false,
    allowedPrefixes: [" "],
    startOfLine: false,
    $position: editor.state.doc.resolve(pos),
  });
}

describe("file mention match", () => {
  it("ends the mention at a space without a task match", () => {
    expect(matchAtEnd("@fix login")).toBeNull();
    expect(matchAtEnd("@fix login", () => false)).toBeNull();
  });

  it("keeps the mention open past a space while a task matches", () => {
    expect(matchAtEnd("@fix login", () => true)?.query).toBe("fix login");
    expect(matchAtEnd("@fix ", () => true)?.query).toBe("fix ");
  });

  it("asks the task matcher with the full query", () => {
    const queries: string[] = [];
    matchAtEnd("see @fix login", (query) => {
      queries.push(query);
      return true;
    });
    expect(queries).toEqual(["fix login"]);
  });

  it("does not consult the task matcher for a query without spaces", () => {
    let called = false;
    const match = matchAtEnd("@fix", () => {
      called = true;
      return true;
    });
    expect(match?.query).toBe("fix");
    expect(called).toBe(false);
  });

  it("leaves issue mentions to their own trigger", () => {
    expect(matchAtEnd("@#12 fix", () => true)).toBeNull();
  });
});
