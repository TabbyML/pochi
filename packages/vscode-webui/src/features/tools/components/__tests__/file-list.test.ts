import { describe, expect, it } from "vitest";
import { getVisibleFileListMatches } from "../file-list-utils";

describe("getVisibleFileListMatches", () => {
  it("returns all matches when the list is below the render cap", () => {
    const matches = Array.from({ length: 3 }, (_, index) => ({
      file: `file-${index}.ts`,
    }));

    expect(getVisibleFileListMatches(matches)).toEqual({
      visibleMatches: matches,
      hiddenCount: 0,
    });
  });

  it("caps visible matches and reports hidden count", () => {
    const matches = Array.from({ length: 205 }, (_, index) => ({
      file: `file-${index}.ts`,
    }));

    const result = getVisibleFileListMatches(matches);

    expect(result.visibleMatches).toHaveLength(200);
    expect(result.visibleMatches.at(-1)?.file).toBe("file-199.ts");
    expect(result.hiddenCount).toBe(5);
  });
});
