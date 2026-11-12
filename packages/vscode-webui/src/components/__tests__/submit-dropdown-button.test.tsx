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
  onToggleServer: vi.fn(),
  resetMcpTools: vi.fn(),
  mcpConfigOverride: {},
};

describe("SubmitDropdownButton", () => {
  it("no longer renders the plan mode toggle", () => {
    render(<SubmitDropdownButton {...defaultProps} />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.getByText("mcpSelect.servers")).not.toBeNull();
    expect(screen.queryByText("chat.planModeLabel")).toBeNull();
  });

  it("no longer renders the todo mode toggle", () => {
    render(<SubmitDropdownButton {...defaultProps} />);

    fireEvent.mouseEnter(screen.getByRole("button"));

    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });

  it("submits directly when the button is clicked", () => {
    const onSubmit = vi.fn();
    render(<SubmitDropdownButton {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "chat.submitTooltip" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
