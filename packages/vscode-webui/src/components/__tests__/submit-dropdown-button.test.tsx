// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SubmitDropdownButton } from "../submit-dropdown-button";

vi.mock("@/lib/hooks/use-mcp", () => ({
  useMcp: () => ({
    connections: {},
    isLoading: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const defaultProps = {
  onSubmit: vi.fn(),
  onSubmitPlan: vi.fn(),
  onToggleServer: vi.fn(),
  resetMcpTools: vi.fn(),
  mcpConfigOverride: {},
};

describe("SubmitDropdownButton", () => {
  it("shows the todo icon when todo mode is active", () => {
    render(<SubmitDropdownButton {...defaultProps} isTodoMode />);

    const button = screen.getByRole("button", {
      name: "chat.todoModeSubmitTooltip",
    });

    const targetIcon = button.querySelector(".lucide-target");
    expect(targetIcon).not.toBeNull();
    expect(targetIcon?.parentElement?.className).toContain("opacity-100");
  });

  it("hides the todo mode toggle by default", () => {
    render(<SubmitDropdownButton {...defaultProps} />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });

  it("shows the todo mode toggle when todo mode is enabled", () => {
    render(<SubmitDropdownButton {...defaultProps} showTodoMode />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.getByText("chat.todoModeLabel")).not.toBeNull();
  });

  it("shows the mode switch shortcut when hovering the todo mode toggle", async () => {
    render(<SubmitDropdownButton {...defaultProps} showTodoMode />);

    fireEvent.mouseEnter(screen.getByRole("button"));
    const todoModeItem = screen
      .getByText("chat.todoModeLabel")
      .closest("[role='menuitem']");
    expect(todoModeItem).not.toBeNull();
    fireEvent.pointerMove(todoModeItem as Element);

    await waitFor(() => {
      expect(
        screen.getAllByText("chat.planModeToggleShortcutTooltip").length,
      ).toBeGreaterThan(0);
    });
  });
});
