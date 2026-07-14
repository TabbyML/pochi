// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("shows the plan mode toggle in the dropdown", () => {
    render(<SubmitDropdownButton {...defaultProps} />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.getByText("chat.planModeLabel")).not.toBeNull();
  });

  it("no longer renders the todo mode toggle", () => {
    render(<SubmitDropdownButton {...defaultProps} />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });

  it("shows the plan submit tooltip when plan mode is active", () => {
    render(<SubmitDropdownButton {...defaultProps} isPlanMode />);

    expect(
      screen.getByRole("button", { name: "chat.planModeSubmitTooltip" }),
    ).not.toBeNull();
  });
});
