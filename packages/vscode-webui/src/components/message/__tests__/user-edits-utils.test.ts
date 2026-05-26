import { describe, expect, it } from "vitest";
import { getDiffStats } from "../user-edits-utils";

describe("getDiffStats", () => {
  it("counts added and removed patch lines", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,2 +1,3 @@",
      "-old",
      "+new",
      "+another",
      " context",
    ].join("\n");

    expect(getDiffStats(diff)).toEqual({
      added: 3,
      removed: 2,
    });
  });
});
