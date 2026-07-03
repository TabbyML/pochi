// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
