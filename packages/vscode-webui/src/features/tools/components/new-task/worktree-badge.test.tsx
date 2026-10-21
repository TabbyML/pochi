// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubagentWorktreeBadge } from "./worktree-badge";

const state = vi.hoisted(() => ({
  task: undefined as { cwd: string | null } | undefined,
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ useQuery: () => state.task }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  state.task = undefined;
});

describe("SubagentWorktreeBadge", () => {
  it("marks a subagent task that has a worktree cwd", () => {
    state.task = { cwd: "/repo.worktree/subagent-1a2b3c4d" };
    render(
      <SubagentWorktreeBadge taskId="1a2b3c4d-0000-4000-8000-000000000000" />,
    );

    expect(screen.getByLabelText("subtask.isolatedWorktree")).toBeTruthy();
  });

  it("renders nothing before the task exists", () => {
    render(
      <SubagentWorktreeBadge taskId="1a2b3c4d-0000-4000-8000-000000000000" />,
    );

    expect(screen.queryByTestId("subagent-worktree-badge")).toBeNull();
  });
});
