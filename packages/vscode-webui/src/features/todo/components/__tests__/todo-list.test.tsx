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
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
  it("renders pause in the header and only edit in the row hover actions", () => {
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
      screen.getByRole("button", { name: "todoList.pauseTodo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "todoList.editTodo" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "todoList.editTodos" }),
    ).toBeNull();
    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    expect(
      within(activeRow as HTMLElement).queryByRole("button", {
        name: "todoList.pauseTodo",
      }),
    ).toBeNull();
    expect(
      activeRow?.querySelector(".group-hover\\/todo\\:opacity-100"),
    ).toBeTruthy();
    expect(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }).textContent,
    ).toBe("");
    expect(
      within(activeRow as HTMLElement).queryByRole("button", {
        name: "todoList.deleteTodo",
      }),
    ).toBeNull();
  });

  it("shows pause and resume tooltips", async () => {
    const { unmount } = render(
      <TodoList
        todos={[activeTodo]}
        todoPaused={false}
        onTodoPausedChange={vi.fn()}
      >
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.pointerMove(
      screen.getByRole("button", { name: "todoList.pauseTodo" }),
    );
    expect(await screen.findAllByText("todoList.pauseTodo")).not.toHaveLength(
      0,
    );

    unmount();
    render(
      <TodoList todos={[activeTodo]} todoPaused onTodoPausedChange={vi.fn()}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.pointerMove(
      screen.getByRole("button", { name: "todoList.resumeTodo" }),
    );
    expect(await screen.findAllByText("todoList.resumeTodo")).not.toHaveLength(
      0,
    );
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

  it("defaults todo lists to collapsed and toggles from the header", async () => {
    render(
      <TodoList todos={[pendingTodo]}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const row = document.getElementById("todo-item-todo-4");
    expect(row).toBeTruthy();

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

  it("edits todo content through the item edit state", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );

    expect(
      screen.getByRole("button", { name: "todoList.saveTodo" }).textContent,
    ).toBe("todoList.saveTodo");
    expect(
      screen.getByRole("button", { name: "todoList.saveTodo" }).className,
    ).toContain("bg-primary");
    const leadingActions = activeRow?.firstElementChild as HTMLElement;
    const editActions = activeRow?.lastElementChild as HTMLElement;
    expect(
      within(leadingActions).queryByRole("button", {
        name: "todoList.deleteTodo",
      }),
    ).toBeNull();
    expect(
      within(editActions)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "todoList.saveTodo",
      "todoList.cancelTodo",
      "todoList.deleteTodo",
    ]);
    const saveButton = within(editActions).getByRole("button", {
      name: "todoList.saveTodo",
    });
    expect(saveButton.className).toContain("h-6");
    expect(saveButton.className).toContain("w-14");
    const cancelButton = within(editActions).getByRole("button", {
      name: "todoList.cancelTodo",
    });
    expect(cancelButton.textContent).toBe("todoList.cancelTodo");
    expect(cancelButton.className).toContain("h-6");
    expect(cancelButton.className).toContain("w-14");
    expect(cancelButton.className).toContain("bg-secondary");
    expect(cancelButton.className.split(/\s+/)).not.toContain("border");
    const deleteButton = within(editActions).getByRole("button", {
      name: "todoList.deleteTodo",
    });
    expect(deleteButton.textContent).toBe("");
    expect(deleteButton.className).toContain("h-6");
    expect(deleteButton.className).toContain("w-6");
    expect(deleteButton.className).toContain("ml-2");
    expect(deleteButton.className.split(/\s+/)).not.toContain("border");
    expect(
      within(editActions).queryByRole("button", {
        name: "todoList.editTodo",
      }),
    ).toBeNull();
    expect(
      within(activeRow as HTMLElement).queryByRole("button", {
        name: "todoList.pauseTodo",
      }),
    ).toBeNull();

    const input = screen.getByLabelText("todoList.editTodoContent");
    fireEvent.change(input, { target: { value: "Increase coverage" } });
    fireEvent.click(screen.getByRole("button", { name: "todoList.saveTodo" }));

    expect(onSaveTodos).toHaveBeenCalledWith([
      { ...activeTodo, content: "Increase coverage" },
    ]);
  });

  it("keeps full todo content when displaying and editing", () => {
    const onSaveTodos = vi.fn();
    const longContent = `${"A".repeat(260)}\n<file>tests/basic.test.tsx</file>`;
    const longTodo = {
      ...activeTodo,
      content: longContent,
    };

    render(
      <TodoList todos={[longTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const expectedContent = `${"A".repeat(260)} tests/basic.test.tsx`;
    expect(screen.getAllByText(expectedContent).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodo" }));
    const input = screen.getByLabelText("todoList.editTodoContent");
    expect((input as HTMLInputElement).value).toBe(expectedContent);

    fireEvent.click(screen.getByRole("button", { name: "todoList.saveTodo" }));

    expect(onSaveTodos).toHaveBeenCalledWith([
      { ...longTodo, content: expectedContent },
    ]);
  });

  it("keeps completed todo content read-only in item edit state", () => {
    render(
      <TodoList todos={[activeTodo, completedTodo]} editable>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const completedRow = document.getElementById("todo-item-todo-2");
    expect(completedRow).toBeTruthy();
    expect(
      within(completedRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    ).toBeTruthy();

    expect(screen.queryByLabelText("todoList.editTodoContent")).toBeNull();
    fireEvent.click(
      within(completedRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    expect(
      within(completedRow as HTMLElement).getByText("Finished work"),
    ).toBeTruthy();
    expect(
      within(completedRow as HTMLElement).queryByLabelText(
        "todoList.editTodoContent",
      ),
    ).toBeNull();
    expect(
      within(completedRow as HTMLElement).queryByRole("button", {
        name: "todoList.saveTodo",
      }),
    ).toBeNull();
    expect(
      within(completedRow as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["todoList.deleteTodo"]);
    const deleteButton = within(completedRow as HTMLElement).getByRole(
      "button",
      {
        name: "todoList.deleteTodo",
      },
    );
    expect(deleteButton.textContent).toBe("");
    expect(deleteButton.className).toContain("w-6");
    expect(deleteButton.className).toContain("ml-2");
    expect(deleteButton.className.split(/\s+/)).not.toContain("border");
    expect(
      within(completedRow as HTMLElement).queryByRole("button", {
        name: "todoList.cancelTodo",
      }),
    ).toBeNull();
  });

  it("deletes todos from the trailing delete action", () => {
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

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.deleteTodo",
      }),
    );

    expect(onSaveTodos).toHaveBeenCalledWith([completedTodo]);
  });

  it("can delete the only todo from the trailing delete action", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.deleteTodo",
      }),
    );

    expect(onSaveTodos).toHaveBeenCalledWith([]);
  });

  it("cancels draft changes from the item edit state", () => {
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

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.cancelTodo",
      }),
    );

    expect(onSaveTodos).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Increase tests/basic.test.tsx coverage").length,
    ).toBeGreaterThan(0);
    expect(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "todoList.cancelTodo" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "todoList.deleteTodo" }),
    ).toBeNull();
  });

  it("can cancel editing the only todo", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "todoList.cancelTodo" }),
    );

    expect(onSaveTodos).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Increase tests/basic.test.tsx coverage").length,
    ).toBeGreaterThan(0);
  });

  it("cancels draft changes with Escape", () => {
    const onSaveTodos = vi.fn();

    render(
      <TodoList todos={[activeTodo]} editable onSaveTodos={onSaveTodos}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodo" }));
    const input = screen.getByLabelText("todoList.editTodoContent");
    fireEvent.change(input, { target: { value: "Draft content" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSaveTodos).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Increase tests/basic.test.tsx coverage").length,
    ).toBeGreaterThan(0);
  });

  it("exits item edit mode on outside click", () => {
    render(
      <>
        <button type="button">outside</button>
        <TodoList todos={[activeTodo]} editable>
          <TodoList.Header />
          <TodoList.Items />
        </TodoList>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "todoList.editTodo" }));
    expect(screen.getByLabelText("todoList.editTodoContent")).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByLabelText("todoList.editTodoContent")).toBeNull();
    expect(
      screen.getByRole("button", { name: "todoList.editTodo" }),
    ).toBeTruthy();
  });

  it("exits item edit mode when clicking outside the input", () => {
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

    const activeRow = document.getElementById("todo-item-todo-1");
    expect(activeRow).toBeTruthy();
    fireEvent.click(
      within(activeRow as HTMLElement).getByRole("button", {
        name: "todoList.editTodo",
      }),
    );
    const input = screen.getByLabelText("todoList.editTodoContent");
    fireEvent.change(input, { target: { value: "Draft content" } });

    fireEvent.pointerDown(screen.getByText("Finished work"));

    expect(onSaveTodos).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("todoList.editTodoContent")).toBeNull();
    expect(
      screen.getAllByText("Increase tests/basic.test.tsx coverage").length,
    ).toBeGreaterThan(0);
  });
});
