// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoList } from "../todo-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const activeTodo = {
  id: "todo-1",
  content: "Increase test coverage",
  status: "in-progress",
  priority: "medium",
} as const;

describe("TodoList", () => {
  it("shows an expanded goal row with inline actions", () => {
    render(
      <TodoList todos={[activeTodo]} goalPaused={false} disableCollapse>
        <TodoList.Header>
          <button type="button">Pause Todo</button>
        </TodoList.Header>
      </TodoList>,
    );

    expect(screen.getByText("todoList.pursuingGoal")).toBeTruthy();
    expect(screen.getByText("Increase test coverage")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause Todo" })).toBeTruthy();
  });

  it("shows pausing state when the goal controller is paused", () => {
    render(
      <TodoList todos={[activeTodo]} goalPaused disableCollapse>
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.getByText("todoList.pausing")).toBeTruthy();
  });
});
