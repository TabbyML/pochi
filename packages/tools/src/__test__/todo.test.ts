import { describe, expect, it } from "vitest";
import { Todo, TodoUpdate } from "../todo";

describe("Todo", () => {
  const todo = {
    id: "collect-information",
    content: "Collect information",
    status: "pending",
    priority: "medium",
  } as const;

  it("accepts the todo shape", () => {
    expect(Todo.safeParse(todo).success).toBe(true);
  });

  it("accepts terminal todo updates", () => {
    expect(
      TodoUpdate.safeParse({
        id: "collect-information",
        status: "completed",
      }).success,
    ).toBe(true);
    expect(
      TodoUpdate.safeParse({
        id: "collect-information",
        status: "in-progress",
      }).success,
    ).toBe(false);
  });

  it("describes cancelled as a blocked state", () => {
    expect(Todo.shape.status.description).toContain(
      '"cancelled" means the todo is blocked',
    );
    expect(Todo.shape.status.description).toContain(
      "cannot make meaningful progress without user input or an external-state change",
    );
  });
});
