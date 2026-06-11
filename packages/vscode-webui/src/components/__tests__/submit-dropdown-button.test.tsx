// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
  it("shows the goal icon when goal mode is active", () => {
    render(<SubmitDropdownButton {...defaultProps} isGoalMode />);

    const button = screen.getByRole("button", {
      name: "chat.goalModeSubmitTooltip",
    });

    const targetIcon = button.querySelector(".lucide-target");
    expect(targetIcon).not.toBeNull();
    expect(targetIcon?.parentElement?.className).toContain("opacity-100");
  });
});
