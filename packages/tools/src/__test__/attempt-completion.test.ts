import { describe, expect, it } from "vitest";
import { z } from "zod";
import { attemptCompletion } from "../attempt-completion";

describe("attemptCompletion", () => {
  it("accepts successful and rejected completion output", () => {
    const schema = attemptCompletion.outputSchema as z.ZodTypeAny;

    expect(schema?.safeParse({ success: true }).success).toBe(true);
    const parsed = schema?.safeParse({
      success: false,
      reason: "More work remains.",
    });

    expect(parsed?.success).toBe(true);
    expect(parsed?.data).toEqual({
      success: false,
      reason: "More work remains.",
    });
    expect(schema?.safeParse({ success: false }).success).toBe(false);
    expect(JSON.stringify(z.toJSONSchema(schema))).toContain(
      "continue working and use the reason as feedback",
    );
  });
});
