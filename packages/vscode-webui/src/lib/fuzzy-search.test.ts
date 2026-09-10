import { describe, expect, it } from "vitest";
import { fuzzySearchFiles } from "./fuzzy-search";

// Non-ASCII fixtures are written as escape sequences to keep this file ASCII-only.
const ChineseFile = "docs/\u4ea7\u54c1\u9700\u6c42\u6587\u6863.md";
const ChineseQuery = "\u9700\u6c42";
// Characters outside the BMP (CJK extension B) are surrogate pairs in UTF-16.
const ExtensionFile = "docs/\u{20BB7}\u{2A6B2}.md";
const ExtensionQuery = "\u{20BB7}";
// U+20800 (D842 DC00) and U+213B7 (D844 DFB7) contain the same surrogates as
// U+20BB7 (D842 DFB7), but neither is that character.
const SurrogateLookalikeFile = "docs/\u{20800}\u{213B7}.md";

const files = [
  { filepath: ChineseFile, isDir: false },
  { filepath: ExtensionFile, isDir: false },
  { filepath: SurrogateLookalikeFile, isDir: false },
  { filepath: "packages/vscode-webui/src/lib/fuzzy-search.ts", isDir: false },
  { filepath: "packages/vscode/src/tools/list-files.ts", isDir: false },
];

const search = (needle: string) =>
  fuzzySearchFiles(needle, { files, activeTabs: [] }).map((x) => x.filepath);

describe("fuzzySearchFiles", () => {
  it("matches a file name by a non-Latin substring", () => {
    expect(search(ChineseQuery)).toEqual([ChineseFile]);
  });

  it("never matches a character outside the BMP against another one", () => {
    // Matching per code unit would let the surrogate halves drift apart and
    // report the lookalike file, which contains neither queried character.
    expect(search(ExtensionQuery)).not.toContain(SurrogateLookalikeFile);
  });

  it("keeps matching ascii paths fuzzily", () => {
    expect(search("fuzzy-search")).toEqual([
      "packages/vscode-webui/src/lib/fuzzy-search.ts",
    ]);
    expect(search("vscode/tools")).toEqual([
      "packages/vscode/src/tools/list-files.ts",
    ]);
  });
});
