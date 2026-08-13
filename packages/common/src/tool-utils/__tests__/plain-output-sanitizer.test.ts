import { describe, expect, it } from "vitest";
import { PlainOutputSanitizer } from "../plain-output-sanitizer";

describe("PlainOutputSanitizer", () => {
  it("removes shell integration and ANSI sequences", () => {
    const sanitizer = new PlainOutputSanitizer();
    expect(
      sanitizer.write(
        "\x1b]633;C\x07stage1-\x1b[1m\x1b[31msuccess\x1b[0m\r\n",
      ),
    ).toBe("stage1-success\r\n");
  });

  it("handles control sequences split across chunks", () => {
    const sanitizer = new PlainOutputSanitizer();
    expect(sanitizer.write("before\x1b]633;")).toBe("before");
    expect(sanitizer.write("C\x07中\x1b[3")).toBe("中");
    expect(sanitizer.write("1m文\x1b[0m after")).toBe("文 after");
    expect(sanitizer.end()).toBe("");
  });

  it("drops non-text control bytes but preserves tabs and line controls", () => {
    const sanitizer = new PlainOutputSanitizer();
    expect(sanitizer.write("a\x00b\x07c\td\re\nf\x7f")).toBe(
      "abc\td\re\nf",
    );
  });
});
