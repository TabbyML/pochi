import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { createPlainTextSlice, shouldPasteAsPlainText } from "../utils";

const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
    },
    paragraph: {
      content: "inline*",
      group: "block",
    },
    text: {
      group: "inline",
    },
  },
});

function paragraphTexts(text: string): string[] {
  const slice = createPlainTextSlice(schema, text);
  const texts: string[] = [];
  slice.content.forEach((node) => texts.push(node.textContent));
  return texts;
}

describe("createPlainTextSlice", () => {
  it("splits newlines into separate paragraphs", () => {
    expect(paragraphTexts("line1\nline2\nline3")).toEqual([
      "line1",
      "line2",
      "line3",
    ]);
  });

  it("normalizes carriage returns", () => {
    expect(paragraphTexts("a\r\nb\rc")).toEqual(["a", "b", "c"]);
  });

  it("collapses consecutive blank lines like ProseMirror does", () => {
    expect(paragraphTexts("a\n\n\nb")).toEqual(["a", "b"]);
  });

  it("keeps a single paragraph when there are no newlines", () => {
    expect(paragraphTexts("hello world")).toEqual(["hello world"]);
  });

  it("produces valid nodes for empty text", () => {
    expect(paragraphTexts("")).toEqual([""]);
  });
});

describe("shouldPasteAsPlainText", () => {
  it("flattens HTML pastes carrying plain text", () => {
    expect(
      shouldPasteAsPlainText({
        text: "line1\nline2",
        html: "<p>line1</p><p>line2</p>",
        hasFiles: false,
      }),
    ).toBe(true);
  });

  it("does not take over in-editor ProseMirror copies", () => {
    expect(
      shouldPasteAsPlainText({
        text: "hello",
        html: '<p data-pm-slice="1 1 []">hello</p>',
        hasFiles: false,
      }),
    ).toBe(false);
  });

  it("ignores plain-text-only pastes", () => {
    expect(
      shouldPasteAsPlainText({
        text: "line1\nline2",
        html: "",
        hasFiles: false,
      }),
    ).toBe(false);
  });

  it("ignores pastes containing files", () => {
    expect(
      shouldPasteAsPlainText({
        text: "",
        html: "",
        hasFiles: true,
      }),
    ).toBe(false);
  });

  it("ignores file pastes even when HTML is present", () => {
    expect(
      shouldPasteAsPlainText({
        text: "alt text",
        html: "<img src='blob:...' />",
        hasFiles: true,
      }),
    ).toBe(false);
  });
});
