import { describe, expect, it } from "vitest";
import { AttemptTodoCompletionResult, Todo, TodoUpdate } from "../todo";

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

  it("accepts todo status updates", () => {
    expect(
      TodoUpdate.safeParse({
        status: "completed",
      }).success,
    ).toBe(true);
    expect(
      TodoUpdate.safeParse({
        status: "in-progress",
      }).success,
    ).toBe(true);
    expect(
      TodoUpdate.parse({
        id: "collect-information",
        status: "completed",
      }),
    ).toEqual({ status: "completed" });
  });

  it("accepts attempt todo completion results", () => {
    expect(
      AttemptTodoCompletionResult.parse({
        success: true,
        summary: "Done.",
        todoUpdates: [{ id: "collect-information", status: "completed" }],
      }),
    ).toEqual({
      success: true,
      summary: "Done.",
      todoUpdates: [{ status: "completed" }],
    });
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
