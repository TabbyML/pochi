// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SubAgentView } from "../new-task/sub-agent-view";

vi.mock("@/components/task-thread", () => ({
  TaskThread: () => <div />,
}));

vi.mock("@/features/chat", () => ({
  FixedStateChatContextProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../tool-call-lite", () => ({
  ToolCallLite: () => <span />,
}));

vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ storeId: "store-id" }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span />,
}));

const browserTool = {
  type: "tool-newTask",
  toolCallId: "browser-call",
  state: "input-available",
  input: {
    agentType: "browser",
    description: "Use the browser",
  },
} as never;

describe("SubAgentView", () => {
  it("does not render a separator below a header-only card", () => {
    const { container } = render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={false}
        taskSource={undefined}
      >
        {null}
      </SubAgentView>,
    );

    const header = container.firstElementChild?.firstElementChild;
    expect(header?.className).not.toContain("border-b");
  });

  it("renders a separator when the card has a body", () => {
    const { container } = render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        taskSource={undefined}
      >
        <div>Browser content</div>
      </SubAgentView>,
    );

    const header = container.firstElementChild?.firstElementChild;
    expect(header?.className).toContain("border-b");
  });
});
