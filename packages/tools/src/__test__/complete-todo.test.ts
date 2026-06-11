import { describe, expect, it } from "vitest";
import {
  completeTodo,
  completeTodoAuditOutputSchema,
  completeTodoOutputSchema,
  resolveCompleteTodoAuditResult,
} from "../complete-todo";

describe("completeTodoOutputSchema", () => {
  it("accepts successful audit output", () => {
    expect(
      completeTodoOutputSchema.safeParse({
        success: true,
        summary: "Verified by tests.",
      }).success,
    ).toBe(true);
  });

  it("accepts incomplete audit output", () => {
    expect(
      completeTodoOutputSchema.safeParse({
        success: false,
        summary: "Missing runtime verification.",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid audit output", () => {
    expect(
      completeTodoOutputSchema.safeParse({
        success: "yes",
        summary: "Invalid",
      }).success,
    ).toBe(false);
    expect(
      completeTodoOutputSchema.safeParse({
        success: true,
      }).success,
    ).toBe(false);
  });
});

describe("completeTodoAuditOutputSchema", () => {
  it("accepts todo updates and an audit summary", () => {
    expect(
      completeTodoAuditOutputSchema.safeParse({
        todoUpdates: [{ id: "todo-1", status: "completed" }],
        summary: "Verified by tests.",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid todo update statuses", () => {
    expect(
      completeTodoAuditOutputSchema.safeParse({
        todoUpdates: [{ id: "todo-1", status: "done" }],
        summary: "Invalid.",
      }).success,
    ).toBe(false);
  });
});

describe("resolveCompleteTodoAuditResult", () => {
  const todo = {
    id: "todo-1",
    content: "Finish the task",
    status: "in-progress",
    priority: "medium",
  } as const;

  it("returns success false when updated todos remain active", () => {
    expect(
      resolveCompleteTodoAuditResult([todo], {
        todoUpdates: [{ id: "todo-1", status: "in-progress" }],
        summary: "More work remains.",
      }),
    ).toEqual({
      todos: [todo],
      output: {
        success: false,
        summary: "More work remains.",
      },
    });
  });

  it("returns success true when todos are completed", () => {
    expect(
      resolveCompleteTodoAuditResult([todo], {
        todoUpdates: [{ id: "todo-1", status: "completed" }],
        summary: "Done.",
      }).output.success,
    ).toBe(true);
  });

  it("returns success true when todos are cancelled", () => {
    const result = resolveCompleteTodoAuditResult([todo], {
      todoUpdates: [{ id: "todo-1", status: "cancelled" }],
      summary: "Stopped.",
    });

    expect(result.todos[0]?.status).toBe("cancelled");
    expect(result.output.success).toBe(true);
  });
});

describe("completeTodo tool description", () => {
  it("encourages a checkpoint before ending an active todo turn", () => {
    expect(completeTodo.description).toContain(
      "before you would otherwise finish your turn",
    );
    expect(completeTodo.description).toContain("active todo");
    expect(completeTodo.description).not.toContain("objective");
  });
});
