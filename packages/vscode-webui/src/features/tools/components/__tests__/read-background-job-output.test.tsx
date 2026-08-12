// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadBackgroundJobOutputTool } from "../read-background-job-output";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <div data-testid="status-icon" />,
}));

vi.mock("../command-execution-panel", () => ({
  BackgroundJobPanel: () => <div data-testid="background-job-panel" />,
}));

function makeTool(overrides: Record<string, unknown>) {
  return {
    type: "tool-readBackgroundJobOutput",
    toolCallId: "call-1",
    input: { backgroundJobId: "bgjob-1" },
    ...overrides,
  } as never;
}

describe("ReadBackgroundJobOutputTool", () => {
  it("does not repeat a user terminal name in the outer title", () => {
    const { container } = render(
      <ReadBackgroundJobOutputTool
        tool={makeTool({
          input: { backgroundJobId: "term-1" },
          state: "output-available",
          output: { output: "", terminalName: "zsh" },
        })}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(container.textContent).toContain("toolInvocation.readTerminal");
    expect(container.textContent).not.toContain("zsh");
  });

  it("shows the detail panel when the read succeeds", () => {
    render(
      <ReadBackgroundJobOutputTool
        tool={makeTool({
          state: "output-available",
          output: { output: "hello" },
        })}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(screen.getByTestId("background-job-panel")).toBeTruthy();
  });

  it("hides the detail panel when the tool call state is output-error", () => {
    render(
      <ReadBackgroundJobOutputTool
        tool={makeTool({
          state: "output-error",
          errorText: "Background job not found.",
        })}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(screen.queryByTestId("background-job-panel")).toBeNull();
  });

  it("hides the detail panel when output-available carries an error field", () => {
    render(
      <ReadBackgroundJobOutputTool
        tool={makeTool({
          state: "output-available",
          output: {
            error:
              'No output available for terminal "term-1". It may have been closed.',
          },
        })}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(screen.queryByTestId("background-job-panel")).toBeNull();
  });

  it("hides the detail panel while input is still streaming", () => {
    render(
      <ReadBackgroundJobOutputTool
        tool={makeTool({
          state: "input-streaming",
        })}
        isExecuting={true}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(screen.queryByTestId("background-job-panel")).toBeNull();
  });
});
