import { describe, expect, it } from "vitest";
import { parseOutputSchema } from "../index";

describe("parseOutputSchema", () => {
  it("parses a zod schema expression", () => {
    const schema = parseOutputSchema(
      "z.object({ success: z.boolean(), summary: z.string() })",
    );

    expect(
      schema.safeParse({ success: true, summary: "complete" }).success,
    ).toBe(true);
    expect(schema.safeParse({ success: true }).success).toBe(false);
  });
});
