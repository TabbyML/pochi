// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoList } from "../todo-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const activeTodo = {
  id: "todo-1",
  content: "Increase <file>tests/basic.test.tsx</file> coverage",
  status: "in-progress",
  priority: "medium",
} as const;

const completedTodo = {
  id: "todo-2",
  content: "Finished work",
  status: "completed",
  priority: "medium",
} as const;

const cancelledTodo = {
  id: "todo-3",
  content: "Stopped work",
  status: "cancelled",
  priority: "medium",
} as const;

describe("TodoList", () => {
  it("renders edit in the header and pause in the active item row", () => {
    render(
      <TodoList
        todos={[activeTodo]}
        editable
        todoPaused={false}
        onTodoPausedChange={vi.fn()}
      >
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    expect(
      screen.getByRole("button", { name: "todoList.editTodos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "todoList.pauseTodo" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "todoList.deleteTodo" }),
    ).toBeNull();
  });

  it("keeps cancelled todos visible", () => {
    render(
      <TodoList todos={[cancelledTodo]}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    expect(
      screen.getAllByText("todoList.cancelledTodo").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Stopped work")).toBeTruthy();
    expect(screen.queryByText("todoList.allDone")).toBeNull();
  });

  it("uses animated header text only when active todo is not paused", () => {
    const { rerender } = render(
      <TodoList todos={[activeTodo]} todoPaused={false}>
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.getByText(activeTodo.content).className).toContain(
      "animated-gradient-text",
    );

    rerender(
      <TodoList todos={[activeTodo]} todoPaused>
        <TodoList.Header />
      </TodoList>,
    );

    expect(screen.getByText(activeTodo.content).className).not.toContain(
      "animated-gradient-text",
    );
  });

  it("edits todo content through a shared edit mode", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodos" }));

    expect(
      screen.getByRole("button", { name: "todoList.saveTodos" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "todoList.cancelEditing" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "todoList.pauseTodo" }),
    ).toBeNull();

    const input = screen.getByLabelText("todoList.editTodoContent");
    fireEvent.change(input, { target: { value: "Increase coverage" } });
    fireEvent.click(screen.getByRole("button", { name: "todoList.saveTodos" }));

    expect(onSaveTodos).toHaveBeenCalledWith([
      { ...activeTodo, content: "Increase coverage" },
    ]);
  });

  it("deletes todos only from the draft until save", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList
        todos={[activeTodo, completedTodo]}
        editable
        onSaveTodos={onSaveTodos}
      >
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodos" }));
    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.deleteTodo",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.saveTodos" }));

    expect(onSaveTodos).toHaveBeenCalledWith([completedTodo]);
  });

  it("cancels draft changes with Escape", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodos" }));
    const input = screen.getByLabelText("todoList.editTodoContent");
    fireEvent.change(input, { target: { value: "Draft content" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSaveTodos).not.toHaveBeenCalled();
    expect(
      screen.getByText("Increase tests/basic.test.tsx coverage"),
    ).toBeTruthy();
  });
});
