import { describe, expect, it } from "vitest";
import { z } from "zod";
import { searchFiles } from "../search-files";

const inputSchema = searchFiles.inputSchema as z.ZodType;

describe("searchFiles", () => {
  it.each([true, false])("accepts case_sensitive %p", (caseSensitive) => {
    expect(
      inputSchema.parse({
        path: ".",
        regex: "hello",
        case_sensitive: caseSensitive,
      }),
    ).toMatchObject({ case_sensitive: caseSensitive });
  });

  it("rejects string values for case_sensitive", () => {
    expect(() =>
      inputSchema.parse({
        path: ".",
        regex: "hello",
        case_sensitive: "false",
      }),
    ).toThrow();
  });

  it("accepts a positive integer limit", () => {
    expect(
      inputSchema.parse({ path: ".", regex: "hello", limit: 10 }),
    ).toMatchObject({ limit: 10 });
    expect(() =>
      inputSchema.parse({ path: ".", regex: "hello", limit: 0 }),
    ).toThrow();
  });

  it("exposes limit and case_sensitive in the JSON schema", () => {
    const properties = inputSchema.toJSONSchema().properties;

    expect(properties).toHaveProperty("limit");
    expect(properties).toHaveProperty("case_sensitive");
  });

  it("explains that limit is optional because the host enforces a safety limit", () => {
    const properties = inputSchema.toJSONSchema().properties;

    expect(properties?.limit?.description).toBe(
      "Limit output to the first N matching lines. The host already applies an internal safety limit when omitted, so only specify this when a smaller result set is necessary.",
    );
  });
});
