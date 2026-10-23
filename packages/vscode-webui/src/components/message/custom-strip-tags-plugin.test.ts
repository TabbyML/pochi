import type { Root } from "hast";
import { describe, expect, it } from "vitest";
import { customStripTagsPlugin } from "./custom-strip-tags-plugin";

function escape(value: string, tagNames = ["file", "task-reference"]) {
  const tree = {
    type: "root",
    children: [{ type: "raw", value }],
  } as unknown as Root;
  const result = customStripTagsPlugin({ tagNames })(tree);
  return (result.children[0] as unknown as { value: string }).value;
}

describe("customStripTagsPlugin", () => {
  it("keeps allowed tags", () => {
    const html = '<task-reference id="a">x</task-reference><file>a.ts</file>';
    expect(escape(html)).toBe(html);
  });

  it("escapes tags that only share a prefix with an allowed tag", () => {
    expect(escape("<task-references>x</task-references>")).toBe(
      "&lt;task-references>x&lt;/task-references>",
    );
    expect(escape("<files>x</files>")).toBe("&lt;files>x&lt;/files>");
  });
});
