// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

const taggedTodo = {
  id: "todo-tagged",
  content:
    'Review <file>src/app.ts</file> with <custom-agent id="planner">planner</custom-agent>',
  status: "in-progress",
  priority: "medium",
} as const;

const completedTodo = {
  ...activeTodo,
  status: "completed",
} as const;

describe("TodoList", () => {
  it("shows an expanded todo row with inline actions", () => {
    render(
      <TodoList todos={[activeTodo]} todoPaused={false} disableCollapse>
        <TodoList.Header>
          <button type="button">Pause Todo</button>
        </TodoList.Header>
      </TodoList>,
    );

    expect(screen.getByText("todoList.pursuingTodo")).toBeTruthy();
    expect(screen.getByText("Increase test coverage")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause Todo" })).toBeTruthy();
  });

  it("shows pausing state when the todo controller is paused", () => {
    render(
      <TodoList todos={[activeTodo]} todoPaused disableCollapse>
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.getByText("todoList.pausing")).toBeTruthy();
  });

  it("filters tags from displayed todo content", () => {
    render(
      <TodoList todos={[taggedTodo]} todoPaused={false} disableCollapse>
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.getByText("Review src/app.ts with /planner")).toBeTruthy();
  });

  it("edits the filtered todo text inline", async () => {
    const onEditTodo = vi.fn();

    render(
      <TodoList
        todos={[taggedTodo]}
        todoPaused={false}
        disableCollapse
        editable
        onEditTodo={onEditTodo}
      >
        <TodoList.Header />
      </TodoList>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit todo" })[0]);
    const input = (
      await screen.findAllByDisplayValue("Review src/app.ts with /planner")
    )[0];
    fireEvent.change(input, { target: { value: "Review src/app.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEditTodo).toHaveBeenCalledWith("todo-tagged", "Review src/app.ts");
  });

  it("deletes a todo directly", () => {
    const onDeleteTodo = vi.fn();

    render(
      <TodoList
        todos={[activeTodo]}
        todoPaused={false}
        disableCollapse
        editable
        onDeleteTodo={onDeleteTodo}
      >
        <TodoList.Header />
      </TodoList>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete todo" })[0]);

    expect(onDeleteTodo).toHaveBeenCalledWith("todo-1");
  });

  it("does not show edit action for a completed todo", () => {
    render(
      <TodoList
        todos={[completedTodo]}
        todoPaused={false}
        disableCollapse
        editable
        onDeleteTodo={vi.fn()}
      >
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.queryByRole("button", { name: "Edit todo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete todo" })).toBeTruthy();
  });
});
