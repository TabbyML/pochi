import { describe, expect, it } from "vitest";
import {
  AttemptTodoCompletionResult,
  Todo,
  TodoUpdate,
  isTodoListResolved,
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

  it("resolves todo updates by id into a full todos list", () => {
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

  it("resolves completed todo updates without a success field", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
          summary: "Done.",
          todoUpdates: [{ id: "collect-information", status: "completed" }],
        },
        [todo],
      ),
    ).toEqual({
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

  it("resolves empty todo updates without a success field", () => {
    expect(
      resolveAttemptTodoCompletionResult(
        {
          summary: "Done.",
          todoUpdates: [],
        },
        [todo],
      ),
    ).toEqual({
      summary: "Done.",
      todos: [todo],
    });
  });

  it("detects whether all todos are resolved", () => {
    expect(
      isTodoListResolved([
        { ...todo, status: "completed" },
        { ...todo, id: "blocked", status: "cancelled" },
      ]),
    ).toBe(true);
    expect(isTodoListResolved([todo])).toBe(false);
  });

  it("describes cancelled as a blocked state", () => {
    expect(Todo.shape.status.description).toContain(
      '"cancelled" means the todo is blocked',
    );
    expect(Todo.shape.status.description).toContain(
      "cannot make meaningful progress without user input or an external-state change",
    );
  });

  it("creates an initial todo mode todo with a short random id", () => {
    const [todo] = initTodoModeTodos("Ship todo mode");

    expect(todo).toMatchObject({
      content: "Ship todo mode",
      status: "in-progress",
      priority: "medium",
    });
    expect(todo?.id).toMatch(/^[0-9a-f]{8}$/);
  });
});
