// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SendMessageToSubagentTool } from "../send-message-to-subagent";
import { ToolCallLite } from "../tool-call-lite";
import type { ToolProps } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/message/task-reference-badge", () => ({
  TaskReferenceBadge: () => null,
  useTaskReference: () => ({ task: undefined, displayTitle: "" }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("@/features/chat", () => ({
  BackgroundTaskButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    useQuery: () =>
      mocks.knownTask
        ? { id: "child", title: "Audit the API docs" }
        : undefined,
  }),
}));

vi.mock("@/lib/hooks/use-background-task-state", () => ({
  useBackgroundTaskState: () => ({
    backgroundTaskState: { agentType: "explore" },
  }),
}));

vi.mock("../new-task/background-status-icon", () => ({
  useBackgroundSubagentStatus: () => mocks.subagentStatus,
}));

const mocks = vi.hoisted(() => ({
  knownTask: true,
  subagentStatus: "running" as string | undefined,
}));

type Tool = ToolProps<"sendMessageToSubagent">["tool"];

const input = {
  backgroundJobId: "bgjob-task-child",
  message: "Also check the image alt texts.\nList each one.",
};

function renderTool(tool: Tool, isExecuting = false) {
  return render(
    <SendMessageToSubagentTool
      tool={tool}
      isExecuting={isExecuting}
      isLoading={false}
    />,
  );
}

describe("SendMessageToSubagentTool", () => {
  it("shows the target subagent and the full message before it is sent", () => {
    renderTool({
      type: "tool-sendMessageToSubagent",
      toolCallId: "call",
      state: "input-available",
      input,
    });

    expect(
      screen.getByText("toolInvocation.sendMessageToSubagent"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "explore" })).toBeTruthy();
    expect(screen.getByText("Audit the API docs")).toBeTruthy();
    expect(screen.getByText("backgroundTasks.running")).toBeTruthy();
    expect(screen.getByLabelText("subagent-message").textContent).toContain(
      "Also check the image alt texts.\nList each one.",
    );
    expect(screen.queryByText("bgjob-task-child")).toBeNull();
    expect(screen.queryByText("toolInvocation.interruptBadge")).toBeNull();
  });

  it("flags an interrupt before and after it happens", () => {
    const { rerender } = renderTool({
      type: "tool-sendMessageToSubagent",
      toolCallId: "call",
      state: "input-available",
      input: { ...input, interrupt: true },
    });
    expect(
      screen.getByText("toolInvocation.sendMessageToSubagentInterrupt"),
    ).toBeTruthy();
    expect(screen.getByText("toolInvocation.interruptBadge")).toBeTruthy();

    rerender(
      <SendMessageToSubagentTool
        isExecuting={false}
        isLoading={false}
        tool={{
          type: "tool-sendMessageToSubagent",
          toolCallId: "call",
          state: "output-available",
          input: { ...input, interrupt: true },
          output: {
            success: true,
            status: "interrupted",
            backgroundJobId: input.backgroundJobId,
          },
        }}
      />,
    );
    expect(
      screen.getByText("toolInvocation.sentMessageToSubagentInterrupted"),
    ).toBeTruthy();
    expect(screen.getByText("toolInvocation.interruptBadge")).toBeTruthy();
  });

  it("does not claim an interrupt when there was nothing to interrupt", () => {
    renderTool({
      type: "tool-sendMessageToSubagent",
      toolCallId: "call",
      state: "output-available",
      input: { ...input, interrupt: true },
      output: {
        success: true,
        status: "queued",
        backgroundJobId: input.backgroundJobId,
      },
    });
    expect(
      screen.getByText("toolInvocation.sentMessageToSubagentQueued"),
    ).toBeTruthy();
    expect(screen.queryByText("toolInvocation.interruptBadge")).toBeNull();
  });

  it.each([
    ["resumed", "toolInvocation.sentMessageToSubagentResumed"],
    ["queued", "toolInvocation.sentMessageToSubagentQueued"],
  ] as const)("labels a %s delivery", (status, label) => {
    renderTool({
      type: "tool-sendMessageToSubagent",
      toolCallId: "call",
      state: "output-available",
      input,
      output: { success: true, status, backgroundJobId: input.backgroundJobId },
    });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("labels a running and a failed call", () => {
    const { rerender } = renderTool(
      {
        type: "tool-sendMessageToSubagent",
        toolCallId: "call",
        state: "input-available",
        input,
      },
      true,
    );
    expect(
      screen.getByText("toolInvocation.sendingMessageToSubagent"),
    ).toBeTruthy();

    rerender(
      <SendMessageToSubagentTool
        isExecuting={false}
        isLoading={false}
        tool={{
          type: "tool-sendMessageToSubagent",
          toolCallId: "call",
          state: "output-available",
          input,
          // @ts-expect-error tool errors are reported in the output
          output: { error: 'Background subagent with ID "x" not found.' },
        }}
      />,
    );
    expect(
      screen.getByText("toolInvocation.sendMessageToSubagentFailed"),
    ).toBeTruthy();
  });

  it("falls back to the job id for a subagent it does not know", () => {
    mocks.knownTask = false;
    mocks.subagentStatus = undefined;
    try {
      renderTool({
        type: "tool-sendMessageToSubagent",
        toolCallId: "call",
        state: "input-available",
        input,
      });
      expect(screen.getByText("bgjob-task-child")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    } finally {
      mocks.knownTask = true;
      mocks.subagentStatus = "running";
    }
  });

  it("has a short label in compact task lists", () => {
    render(
      <ToolCallLite
        showStatusIcon={false}
        tools={[
          {
            type: "tool-sendMessageToSubagent",
            toolCallId: "call",
            state: "input-available",
            input,
          },
        ]}
      />,
    );
    expect(
      screen.getByText("toolInvocation.sendingMessageToSubagent"),
    ).toBeTruthy();
  });
});
