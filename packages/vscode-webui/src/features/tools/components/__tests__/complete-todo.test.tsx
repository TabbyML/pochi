import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompleteTodoTool } from "../complete-todo";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolInvocation.auditingTodo": "Auditing Todo",
      })[key] ?? key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: ({ isExecuting }: { isExecuting: boolean }) => (
    <span data-executing={String(isExecuting)} data-testid="status-icon" />
  ),
}));

vi.mock("@/components/message", () => ({
  MessageMarkdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const completeTodoTool = {
  type: "tool-completeTodo",
  toolCallId: "call-1",
  state: "output-available",
  input: {},
  output: {
    success: true,
    summary: "Verified by tests.",
  },
} as const;

describe("CompleteTodoTool", () => {
  it("shows a concise audit title with the shared status icon", () => {
    const { container } = render(
      <CompleteTodoTool
        tool={completeTodoTool as never}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(container.textContent).toContain("Auditing Todo");
    expect(container.textContent).toContain("Verified by tests.");
    expect(container.textContent).not.toContain("TODO audit finished");
    expect(
      container.querySelector('[data-testid="status-icon"]'),
    ).not.toBeNull();
  });

  it("lets the shared status icon render the executing state", () => {
    const { container } = render(
      <CompleteTodoTool
        tool={
          {
            type: "tool-completeTodo",
            toolCallId: "call-1",
            state: "input-available",
            input: {},
          } as never
        }
        isExecuting
        isLoading={false}
        messages={[]}
      />,
    );

    expect(
      container
        .querySelector('[data-testid="status-icon"]')
        ?.getAttribute("data-executing"),
    ).toBe("true");
  });
});
