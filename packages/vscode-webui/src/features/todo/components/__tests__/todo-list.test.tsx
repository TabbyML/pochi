// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TodoList } from "../todo-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  window.scrollTo = vi.fn();
});

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

const pendingTodo = {
  ...activeTodo,
  id: "todo-4",
  status: "pending",
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

  it("collapses and expands todos from the header", async () => {
    render(
      <TodoList todos={[pendingTodo]}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const row = document.getElementById("todo-item-todo-4");
    expect(row).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        row?.parentElement?.parentElement?.getAttribute("style"),
      ).toContain("height: 0px"),
    );

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        row?.parentElement?.parentElement?.getAttribute("style"),
      ).not.toContain("height: 0px"),
    );
  });

  it("does not auto-collapse active todos when todos update", async () => {
    const { rerender } = render(
      <TodoList todos={[activeTodo]}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const row = document.getElementById("todo-item-todo-1");
    expect(row).toBeTruthy();
    expect(
      row?.parentElement?.parentElement?.getAttribute("style"),
    ).not.toContain("height: 0px");

    rerender(
      <TodoList
        todos={[
          {
            ...activeTodo,
            content: "Increase <file>tests/basic.test.tsx</file> coverage more",
          },
        ]}
      >
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    await waitFor(() =>
      expect(
        row?.parentElement?.parentElement?.getAttribute("style"),
      ).not.toContain("height: 0px"),
    );
  });

  it("keeps finished todos expanded when collapse is disabled", async () => {
    render(
      <TodoList todos={[completedTodo]} disableCollapse>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const row = document.getElementById("todo-item-todo-2");
    expect(row).toBeTruthy();
    expect(
      row?.parentElement?.parentElement?.getAttribute("style"),
    ).not.toContain("height: 0px");

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        row?.parentElement?.parentElement?.getAttribute("style"),
      ).not.toContain("height: 0px"),
    );
  });

  it("uses animated header text only when active todo is not paused", () => {
    const { rerender } = render(
      <TodoList todos={[activeTodo]} todoPaused={false}>
        <TodoList.Header />
      </TodoList>,
    );

    expect(
      screen.getByText("Increase tests/basic.test.tsx coverage").className,
    ).toContain("animated-gradient-text");

    rerender(
      <TodoList todos={[activeTodo]} todoPaused>
        <TodoList.Header />
      </TodoList>,
    );

    expect(
      screen.getByText("Increase tests/basic.test.tsx coverage").className,
    ).not.toContain("animated-gradient-text");
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

  it("can delete the only todo", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "todoList.deleteTodo" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "todoList.saveTodos" }));

    expect(onSaveTodos).toHaveBeenCalledWith([]);
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
      screen.getAllByText("Increase tests/basic.test.tsx coverage").length,
    ).toBeGreaterThan(0);
  });
});
