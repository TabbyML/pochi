import { describe, expect, it } from "vitest";
import { PochiProviderOptions } from "../index";

describe("PochiProviderOptions", () => {
  it("accepts fork agent labels as request use cases", () => {
    const result = PochiProviderOptions.safeParse({
      taskId: "task-1",
      client: "vscode",
      useCase: "task-memory",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown request use cases", () => {
    const result = PochiProviderOptions.safeParse({
      taskId: "task-1",
      client: "vscode",
      useCase: "custom-fork-label",
    });

    expect(result.success).toBe(false);
  });
});
