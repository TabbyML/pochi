import { describe, expect, it } from "vitest";
import { PochiProviderOptions } from "../index";

describe("PochiProviderOptions", () => {
  it("accepts fork agent labels as request use cases", () => {
    const result = PochiProviderOptions.safeParse({
      taskId: "task-1",
      storeId: "store-1",
      client: "vscode",
      useCase: "task-memory",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a number of compacts", () => {
    const result = PochiProviderOptions.safeParse({
      taskId: "task-1",
      storeId: "store-1",
      client: "vscode",
      useCase: "agent",
      numCompacts: 2,
    });

    expect(result.success).toBe(true);
    expect(result.data?.numCompacts).toBe(2);
  });

  it("rejects unknown request use cases", () => {
    const result = PochiProviderOptions.safeParse({
      taskId: "task-1",
      storeId: "store-1",
      client: "vscode",
      useCase: "custom-fork-label",
    });

    expect(result.success).toBe(false);
  });
});
