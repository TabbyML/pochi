import { describe, expect, it } from "vitest";
import { allTasks$, tasks$ } from "./default-queries";

describe("task queries", () => {
  it("keeps the task-list query scoped to root tasks", () => {
    expect(tasks$.hash).toContain('.where("parentId", "=", null)');
  });

  it("does not exclude child tasks from the all-tasks query", () => {
    expect(allTasks$.hash).not.toContain("parentId");
  });
});
