import { describe, expect, it } from "vitest";
import {
  AttemptTodoCompletionResult,
  Todo,
  TodoUpdate,
  initTodoModeTodos,
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
        summary: "Done.",
        todoUpdates: [{ id: "collect-information", status: "completed" }],
      }),
    ).toEqual({
      summary: "Done.",
      todoUpdates: [{ id: "collect-information", status: "completed" }],
    });
  });

  it("resolves todo updates by id into a full todos list and infers success", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
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

  it("infers success when todo updates resolve every todo", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
          summary: "Done.",
          todoUpdates: [{ id: "collect-information", status: "completed" }],
        },
        [todo],
      ),
    ).toEqual({
      success: true,
      summary: "Done.",
      todos: [
        {
          ...todo,
          status: "completed",
        },
      ],
    });
  });

  it("rejects todo updates for unknown ids", () => {
    expect(() =>
      resolveAttemptTodoCompletionResult(
        {
          summary: "Done.",
          todoUpdates: [{ id: "missing", status: "completed" }],
        },
        [todo],
      ),
    ).toThrow("Invalid attemptTodoCompletion result");
  });

  it("infers failure when resolved todos still need work", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
          summary: "Done.",
          todoUpdates: [],
        },
        [todo],
      ),
    ).toEqual({
      success: false,
      summary: "Done.",
      todos: [todo],
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

  it("creates initial todo mode todos with short incremental ids", () => {
    const [firstTodo] = initTodoModeTodos("Ship todo mode");
    const [secondTodo] = initTodoModeTodos("Follow up");

    expect(firstTodo).toMatchObject({
      content: "Ship todo mode",
      status: "in-progress",
      priority: "medium",
    });
    expect(secondTodo).toMatchObject({
      content: "Follow up",
      status: "in-progress",
      priority: "medium",
    });

    const firstId = getTodoIdNumber(firstTodo?.id);
    const secondId = getTodoIdNumber(secondTodo?.id);

    expect(firstId).toBeGreaterThan(0);
    expect(secondId).toBe(firstId + 1);
  });
});

function getTodoIdNumber(id: string | undefined): number {
  expect(id).toMatch(/^todo-\d+$/);
  return Number(id?.slice("todo-".length));
}
