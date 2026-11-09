import { describe, expect, it } from "vitest";
import { getDiffStats } from "../diff-stats";

// Same shape as `createPatch` from the `diff` package, which the extension
// uses to build user-edit diffs.
const modifiedPatch = [
  "Index: src/a.ts",
  "===================================================================",
  "--- src/a.ts",
  "+++ src/a.ts",
  "@@ -1,4 +1,4 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  " const d = 5;",
  "",
].join("\n");

describe("getDiffStats", () => {
  it("does not count the ---/+++ file headers", () => {
    expect(getDiffStats(modifiedPatch)).toEqual({ added: 1, removed: 1 });
  });

  it("counts content lines that start with -- or ++", () => {
    const patch = [
      "--- notes.md",
      "+++ notes.md",
      "@@ -1,2 +1,2 @@",
      "--- old divider",
      "+++ new divider",
      " text",
      "",
    ].join("\n");

    expect(getDiffStats(patch)).toEqual({ added: 1, removed: 1 });
  });

  it("sums multiple hunks", () => {
    const patch = [
      "--- a.txt",
      "+++ a.txt",
      "@@ -1,3 +1,4 @@",
      " one",
      "+one-and-a-half",
      " two",
      " three",
      "@@ -10,3 +11,2 @@",
      " ten",
      "-eleven",
      " twelve",
      "",
    ].join("\n");

    expect(getDiffStats(patch)).toEqual({ added: 1, removed: 1 });
  });

  it("handles created files, omitted hunk counts and no-newline markers", () => {
    const created = [
      "--- new.txt",
      "+++ new.txt",
      "@@ -0,0 +1,2 @@",
      "+first",
      "+second",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    const singleLine = [
      "--- one.txt",
      "+++ one.txt",
      "@@ -1 +1 @@",
      "-before",
      "\\ No newline at end of file",
      "+after",
      "\\ No newline at end of file",
      "",
    ].join("\n");

    expect(getDiffStats(created)).toEqual({ added: 2, removed: 0 });
    expect(getDiffStats(singleLine)).toEqual({ added: 1, removed: 1 });
  });

  it("skips headers between files in a multi-file patch", () => {
    const patch = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,2 @@",
      " keep",
      "+add",
      "diff --git a/b.ts b/b.ts",
      "--- a/b.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-gone",
      "-gone too",
      "",
    ].join("\n");

    expect(getDiffStats(patch)).toEqual({ added: 1, removed: 2 });
  });

  it("returns zero for an empty diff", () => {
    expect(getDiffStats("")).toEqual({ added: 0, removed: 0 });
  });
});
