// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutoApproveMenu } from "../auto-approve-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../hooks/use-auto-approve", () => ({
  useAutoApprove: () => ({
    autoApproveActive: true,
    updateAutoApproveActive: vi.fn(),
    autoApproveSettings: {
      default: false,
      read: true,
      write: true,
      execute: true,
      mcp: true,
      retry: true,
      maxRetryLimit: 3,
    },
    updateAutoApproveSettings: vi.fn(),
  }),
}));

vi.mock("../../hooks/use-subtask-offhand", () => ({
  useSubtaskOffhand: () => ({
    subtaskOffhand: true,
    toggleSubtaskOffhand: vi.fn(),
  }),
}));

vi.mock("../../store", () => ({
  GlobalStateStorage: {
    persist: vi.fn(),
  },
}));

describe("AutoApproveMenu", () => {
  it("shows a todo auto-continuation checkbox bound to the goal pause handler", () => {
    const onGoalPausedChange = vi.fn();

    render(
      <AutoApproveMenu
        isSubTask={false}
        goalPaused={false}
        onGoalPausedChange={onGoalPausedChange}
        trigger={<button type="button">Settings</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByLabelText("chat.autoContinueTodo"));

    expect(onGoalPausedChange).toHaveBeenCalledWith(true);
  });
});
