import { describe, expect, it } from "vitest";
import { fuzzySearchFiles, fuzzySearchTasks } from "./fuzzy-search";

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

describe("fuzzySearchTasks", () => {
  const tasks = [
    { title: "Fix login bug" },
    { title: "Refactor payment module" },
    { title: undefined },
  ];

  it("returns the most recent tasks without a query", () => {
    expect(fuzzySearchTasks("", tasks, 2)).toEqual(tasks.slice(0, 2));
  });

  it("matches tasks by title", () => {
    expect(fuzzySearchTasks("payment", tasks)).toEqual([tasks[1]]);
  });

  it("returns nothing when no title matches", () => {
    expect(fuzzySearchTasks("zzzzzz", tasks)).toEqual([]);
  });

  it("matches a query made of several words", () => {
    expect(fuzzySearchTasks("fix login", tasks)).toEqual([tasks[0]]);
  });

  it("matches words typed in a different order", () => {
    expect(fuzzySearchTasks("bug login", tasks)).toEqual([tasks[0]]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(fuzzySearchTasks("fix login ", tasks)).toEqual([tasks[0]]);
    expect(fuzzySearchTasks("   ", tasks, 2)).toEqual(tasks.slice(0, 2));
  });
});
