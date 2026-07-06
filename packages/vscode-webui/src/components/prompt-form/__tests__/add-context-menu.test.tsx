// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AddContextMenu } from "../add-context-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Radix menus rely on pointer capture / scrollIntoView which jsdom does not implement.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function openMenu() {
  const trigger = screen.getByRole("button");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("AddContextMenu", () => {
  it("triggers files and folders selection", () => {
    const onAddFilesAndFolders = vi.fn();
    render(<AddContextMenu onAddFilesAndFolders={onAddFilesAndFolders} />);

    openMenu();
    fireEvent.click(screen.getByText("addContextMenu.files"));

    expect(onAddFilesAndFolders).toHaveBeenCalledTimes(1);
  });

  it("hides optional items when their handlers are not provided", () => {
    render(<AddContextMenu onAddFilesAndFolders={vi.fn()} />);

    openMenu();

    expect(screen.getByText("addContextMenu.files")).not.toBeNull();
    expect(screen.queryByText("addContextMenu.attach")).toBeNull();
    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });

  it("shows and triggers the attach files option when provided", () => {
    const onAttachFile = vi.fn();
    render(
      <AddContextMenu
        onAddFilesAndFolders={vi.fn()}
        onAttachFile={onAttachFile}
      />,
    );

    openMenu();
    fireEvent.click(screen.getByText("addContextMenu.attach"));

    expect(onAttachFile).toHaveBeenCalledTimes(1);
  });

  it("shows and triggers the todo mode option when provided", () => {
    const onSelectTodoMode = vi.fn();
    render(
      <AddContextMenu
        onAddFilesAndFolders={vi.fn()}
        onSelectTodoMode={onSelectTodoMode}
      />,
    );

    openMenu();
    fireEvent.click(screen.getByText("chat.todoModeLabel"));

    expect(onSelectTodoMode).toHaveBeenCalledTimes(1);
  });

  it("keeps the todo mode option visible but not selectable when disabled", () => {
    const onSelectTodoMode = vi.fn();
    render(
      <AddContextMenu
        onAddFilesAndFolders={vi.fn()}
        onSelectTodoMode={onSelectTodoMode}
        todoModeDisabled
      />,
    );

    openMenu();

    const todoItem = screen
      .getByText("chat.todoModeLabel")
      .closest("[role='menuitem']");
    expect(todoItem).not.toBeNull();
    expect(todoItem?.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.click(screen.getByText("chat.todoModeLabel"));
    expect(onSelectTodoMode).not.toHaveBeenCalled();
  });
});
