import { describe, expect, it } from "vitest";
import {
  makeAddedFilePatch,
  makeFileMatches,
  makeReplaceFilePatch,
  makeWriteToFileTool,
} from "../perf-data";

describe("perf data", () => {
  it("creates a valid added-file patch with the requested number of additions", () => {
    const patch = makeAddedFilePatch("plan.md", 3);

    expect(patch).toContain("diff --git a/plan.md b/plan.md");
    expect(patch).toContain("new file mode 100644");
    expect(patch).toContain("@@ -0,0 +1,3 @@");
    expect(patch.match(/^\+/gm)).toHaveLength(4);
  });

  it("creates a replace patch with balanced additions and removals", () => {
    const patch = makeReplaceFilePatch("plan.md", 4);

    expect(patch).toContain("index 1111111..2222222 100644");
    expect(patch).toContain("@@ -1,4 +1,4 @@");
    expect(patch.match(/^\-/gm)).toHaveLength(5);
    expect(patch.match(/^\+/gm)).toHaveLength(5);
  });

  it("creates deterministic file matches", () => {
    expect(makeFileMatches(2)).toEqual([
      {
        file: "packages/example/src/generated/file-00000.tsx",
        line: 1,
        context: "match context for generated file 1",
      },
      {
        file: "packages/example/src/generated/file-00001.tsx",
        line: 2,
        context: "match context for generated file 2",
      },
    ]);
  });

  it("creates markdown-heavy writeToFile data", () => {
    const tool = makeWriteToFileTool(20);
    const input = tool.input as { content: string };
    const output = tool.output as { _meta: { edit: string } };

    expect(input.content).toContain("# Current implementation plan");
    expect(input.content).toContain("```ts");
    expect(input.content).toContain("| Area | Signal | Expected impact |");
    expect(input.content.split("\n")).toHaveLength(20);
    expect(output._meta.edit).toContain("```json");
  });
});
