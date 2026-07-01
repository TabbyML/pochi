import { describe, expect, it } from "vitest";
import {
  AttemptTodoCompletionResult,
  Todo,
  TodoUpdate,
  resolveAttemptTodoCompletionResult,
} from "../todo";

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
    ).toBe(false);
    expect(
      TodoUpdate.safeParse({
        id: "collect-information",
        status: "in-progress",
      }).success,
    ).toBe(true);
    expect(
      TodoUpdate.parse({
        id: "collect-information",
        status: "completed",
      }),
    ).toEqual({ id: "collect-information", status: "completed" });
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
      todoUpdates: [{ id: "collect-information", status: "completed" }],
    });
  });

  it("resolves todo updates by id into a full todos list", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
          success: false,
          summary: "Done.",
          todoUpdates: [
            { id: "review-changes", status: "in-progress" },
            { id: "collect-information", status: "completed" },
          ],
        },
        [
          todo,
          {
            id: "review-changes",
            content: "Review changes",
            status: "pending",
            priority: "medium",
          },
        ],
      ),
    ).toEqual({
      success: false,
      summary: "Done.",
      todos: [
        {
          ...todo,
          status: "completed",
        },
        {
          id: "review-changes",
          content: "Review changes",
          status: "in-progress",
          priority: "medium",
        },
      ],
    });
  });

  it("rejects todo updates for unknown ids", () => {
    expect(() =>
      resolveAttemptTodoCompletionResult(
        {
          success: true,
          summary: "Done.",
          todoUpdates: [{ id: "missing", status: "completed" }],
        },
        [todo],
      ),
    ).toThrow("Invalid attemptTodoCompletion result");
  });

  it("rejects successful results when resolved todos still need work", () => {
    expect(() =>
      resolveAttemptTodoCompletionResult(
        {
          success: true,
          summary: "Done.",
          todoUpdates: [],
        },
        [todo],
      ),
    ).toThrow("Invalid attemptTodoCompletion result");
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
