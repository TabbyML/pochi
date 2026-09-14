// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { Task } from "@getpochi/livekit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolProps } from "../types";
import { BackgroundSubagentStatusIcon } from "./background-status-icon";

const state = vi.hoisted(() => ({ task: undefined as Pick<Task, "status" | "error"> | undefined }));
vi.mock("@/lib/use-default-store", () => ({ useDefaultStore: () => ({ useQuery: () => state.task }) }));
vi.mock("@/features/settings", () => ({ useIsDevMode: () => [false] }));
vi.mock("@/lib/hooks/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => ({ isCopied: false, copyToClipboard: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const tool: ToolProps<"newTask">["tool"] = {
  type: "tool-newTask", toolCallId: "start", state: "output-available",
  input: { description: "Review", prompt: "Review files", background: true, _meta: { uid: "child" } },
  output: { result: "Started", backgroundJobId: "bgjob-task-child" },
};
afterEach(cleanup);

describe("background subagent tool status", () => {
  it("updates from running to completion while the tool remains output-available", () => {
    state.task = { status: "pending-model", error: null };
    const { rerender } = render(<BackgroundSubagentStatusIcon taskId="child" tool={tool} />);
    expect(screen.getByRole("img", { name: "backgroundTasks.running" }).querySelector(".animate-spin")).toBeTruthy();
    state.task = { status: "completed", error: null };
    rerender(<BackgroundSubagentStatusIcon taskId="child" tool={tool} />);
    expect(screen.getByRole("img", { name: "backgroundTasks.completed" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "backgroundTasks.running" })).toBeNull();
  });
  it.each([
    ["pending-tool", null, "running"],
    ["pending-input", null, "waitingInput"],
    ["failed", { kind: "InternalError", message: "Failed" }, "failed"],
    ["failed", { kind: "AbortError", message: "Stopped" }, "stopped"],
  ] as const)("renders %s / %j as %s", (status, error, label) => {
    state.task = { status, error };
    render(<BackgroundSubagentStatusIcon taskId="child" tool={tool} />);
    expect(screen.getByRole("img", { name: `backgroundTasks.${label}` })).toBeTruthy();
  });
  it("does not claim completion when the subtask cannot be found", () => {
    state.task = undefined;
    render(<BackgroundSubagentStatusIcon taskId="child" tool={tool} />);
    expect(screen.getByRole("img", { name: "backgroundTasks.statusUnavailable" })).toBeTruthy();
  });
});
