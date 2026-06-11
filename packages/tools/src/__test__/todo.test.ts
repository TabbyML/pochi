import { describe, expect, it } from "vitest";
import { Todo } from "../todo";

describe("Todo", () => {
  const todo = {
    id: "collect-information",
    content: "Collect information",
    status: "pending",
    priority: "medium",
  } as const;

  it("accepts the goal todo shape", () => {
    expect(Todo.safeParse(todo).success).toBe(true);
  });
});
