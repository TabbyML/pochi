import { describe, expect, it } from "vitest";
import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import {
  getAttemptTodoCompletionSummary,
  getInitialTodos,
  isAttemptTodoCompletionResolved,
} from "../todos-utils";

function makeResolvedTodos(status: "completed" | "in-progress") {
  return [
    {
      id: "todo-1",
      content: "Add one test",
      status,
      priority: "medium",
    },
  ] as const;
}

const completedTodos = makeResolvedTodos("completed");
const inProgressTodos = makeResolvedTodos("in-progress");

const activeTodo: Todo = {
  id: "todo-1",
  content: "Add one test",
  status: "in-progress",
  priority: "medium",
};

const newTaskInfo: PochiTaskInfo = {
  uid: "task-1",
  type: "new-task",
  cwd: "/repo",
  todos: [activeTodo],
};

const userMessage: Message = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "start" }],
};

const assistantMessage: Message = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "done" }],
};

describe("getAttemptTodoCompletionSummary", () => {
  it("returns summary from structured results", () => {
    expect(
      getAttemptTodoCompletionSummary({
        summary: "More work remains.",
        todos: inProgressTodos,
      }),
    ).toBe("More work remains.");
  });

  it("returns summary from JSON string results", () => {
    expect(
      getAttemptTodoCompletionSummary(
        JSON.stringify({
          summary: "More work remains.",
          todos: inProgressTodos,
        }),
      ),
    ).toBe("More work remains.");
  });

  it("ignores incomplete structured results", () => {
    expect(
      getAttemptTodoCompletionSummary({
        summary: "More work remains.",
      }),
    ).toBeUndefined();
  });

  it("ignores non-summary results", () => {
    expect(getAttemptTodoCompletionSummary("Done")).toBeUndefined();
  });
});

describe("isAttemptTodoCompletionResolved", () => {
  it("detects resolved todo completion output envelopes", () => {
    expect(
      isAttemptTodoCompletionResolved({
        result: {
          summary: "All todos are complete.",
          todos: completedTodos,
        },
      }),
    ).toBe(true);
  });

  it("detects unresolved JSON output envelopes", () => {
    expect(
      isAttemptTodoCompletionResolved({
        type: "json",
        value: {
          result: JSON.stringify({
            summary: "More work remains.",
            todos: inProgressTodos,
          }),
        },
      }),
    ).toBe(false);
  });

  it("falls back to legacy success results", () => {
    expect(isAttemptTodoCompletionResolved({ success: false })).toBe(false);
  });
});

describe("getInitialTodos", () => {
  it("keeps new-task initial todos for a pristine task with only a user message", () => {
    expect(
      getInitialTodos({
        info: newTaskInfo,
        isSubTask: false,
        task: {
          todos: [],
        },
        messageRows: [{ data: userMessage }],
      }),
    ).toEqual([activeTodo]);
  });

  it("keeps new-task initial todos before the task exists", () => {
    expect(
      getInitialTodos({
        info: newTaskInfo,
        isSubTask: false,
        messageRows: [],
      }),
    ).toEqual([activeTodo]);
  });

  it("drops new-task initial todos after the task has an assistant message", () => {
    expect(
      getInitialTodos({
        info: newTaskInfo,
        isSubTask: false,
        task: {
          todos: [],
        },
        messageRows: [{ data: userMessage }, { data: assistantMessage }],
      }),
    ).toBeUndefined();
  });

  it("keeps attemptTodoCompletion subtask todos", () => {
    expect(
      getInitialTodos({
        info: {
          uid: "subtask-1",
          type: "open-task",
          cwd: "/repo",
        },
        isSubTask: true,
        subtask: {
          agent: "attemptTodoCompletion",
          todos: [activeTodo],
        },
        task: {
          todos: [],
        },
        messageRows: [{ data: assistantMessage }],
      }),
    ).toEqual([activeTodo]);
  });
});
