import { describe, expect, it } from "vitest";
import { resolveReadFileRange } from "../read-file-range";

describe("resolveReadFileRange", () => {
  it("converts offset and limit to an inclusive line range", () => {
    expect(resolveReadFileRange({ offset: 10, limit: 20 })).toEqual({
      startLine: 10,
      endLine: 29,
    });
  });

  it("starts at the first line when only limit is provided", () => {
    expect(resolveReadFileRange({ limit: 20 })).toEqual({
      startLine: 1,
      endLine: 20,
    });
  });

  it("keeps the legacy range during the compatibility period", () => {
    expect(resolveReadFileRange({ startLine: 2, endLine: 4 })).toEqual({
      startLine: 2,
      endLine: 4,
    });
  });

  it("prefers offset/limit when a model repeats legacy range fields", () => {
    expect(
      resolveReadFileRange({
        startLine: 1,
        endLine: 50,
        offset: 1,
        limit: 50,
      }),
    ).toEqual({ startLine: 1, endLine: 50 });

    expect(
      resolveReadFileRange({
        startLine: 20,
        endLine: 30,
        offset: 2,
        limit: 3,
      }),
    ).toEqual({ startLine: 2, endLine: 4 });
  });
});
