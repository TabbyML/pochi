import type { Todo } from "@getpochi/tools";
import { describe, expect, it } from "vitest";
import { areTodosFinished, hasActiveTodos, hasTodos } from "../todo";

describe("todo state helpers", () => {
  const todo = (status: Todo["status"]): Todo => ({
    id: status,
    content: status,
    status,
    priority: "medium",
  });

  it("detects whether any todos are present", () => {
    expect(hasTodos(undefined)).toBe(false);
    expect(hasTodos([])).toBe(false);
    expect(hasTodos([todo("completed")])).toBe(true);
  });

  it("only treats pending and in-progress todos as active", () => {
    expect(hasActiveTodos([todo("completed"), todo("cancelled")])).toBe(false);
    expect(hasActiveTodos([todo("pending")])).toBe(true);
    expect(hasActiveTodos([todo("in-progress")])).toBe(true);
  });

  it("detects finished todos without requiring them to be cleared", () => {
    expect(areTodosFinished([])).toBe(false);
    expect(areTodosFinished([todo("completed"), todo("cancelled")])).toBe(true);
    expect(areTodosFinished([todo("completed"), todo("in-progress")])).toBe(
      false,
    );
  });
});
