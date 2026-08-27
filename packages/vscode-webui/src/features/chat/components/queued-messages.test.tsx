// @vitest-environment jsdom
import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DraftMessage } from "../hooks/use-chat-submit";
import { QueuedMessages } from "./queued-messages";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {
    openFile: vi.fn(),
  },
}));

vi.mock("@/features/tools", () => ({
  BackgroundJobPanel: ({
    command,
    summary,
  }: {
    command?: string;
    summary?: string;
  }) => {
    const prefix = command ? `Background command "${command}" ` : "";
    const conciseSummary =
      summary && prefix && summary.startsWith(prefix)
        ? summary.slice(prefix.length)
        : summary;
    return (
      <div>
        <span aria-hidden="true">status</span>
        <span>{command}</span>
        <span>{conciseSummary}</span>
      </div>
    );
  },
}));

describe("QueuedMessages", () => {
  it("uses the todo icon for queued todo-mode messages", () => {
    const { container } = render(
      <QueuedMessages
        messages={[
          queuedMessage({ text: "regular queued message" }),
          queuedMessage({ text: "todo queued message", isTodoMode: true }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".lucide-list-end")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-target")).toHaveLength(1);
  });

  it("shows a fallback title and file/review counts when text is empty", () => {
    const { getByText } = render(
      <QueuedMessages
        messages={[
          queuedMessage({ text: "  ", filesCount: 2, reviewsCount: 1 }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(getByText("chat.noMessage")).toBeTruthy();
    expect(getByText("chat.fileCount:2 · chat.reviewCount:1")).toBeTruthy();
  });

  it("shows the user edit count alongside file/review counts", () => {
    const { getByText } = render(
      <QueuedMessages
        messages={[
          queuedMessage({
            text: "  ",
            filesCount: 2,
            reviewsCount: 1,
            userEditsCount: 3,
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(
      getByText("chat.fileCount:2 · chat.reviewCount:1 · chat.userEditCount:3"),
    ).toBeTruthy();
  });

  it("shows the terminal context count alongside other counts", () => {
    const { getByText } = render(
      <QueuedMessages
        messages={[
          queuedMessage({
            text: "  ",
            terminalContextCount: 2,
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(getByText("chat.terminalContextCount:2")).toBeTruthy();
  });

  it("renders a minimal icon-only preview for the active editor selection captured at queue time", () => {
    const activeSelection: ActiveSelection = {
      filepath: "/workspace/foo.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 0 },
      },
      content: "const foo = 1;",
    };

    const { container, getByLabelText } = render(
      <QueuedMessages
        messages={[queuedMessage({ text: "check this", activeSelection })]}
        onRemove={vi.fn()}
      />,
    );

    // Icon-only trigger, keyed to the filepath, without a visible filename label.
    expect(getByLabelText("/workspace/foo.ts")).toBeTruthy();
    expect(container.textContent).not.toContain("foo.ts");
  });

  it("disables the steer button when allowSteer is false", () => {
    const { getByLabelText } = render(
      <QueuedMessages
        messages={[queuedMessage({ text: "check this" })]}
        onRemove={vi.fn()}
        onSteer={vi.fn()}
        allowSteer={false}
      />,
    );

    expect((getByLabelText("chat.steer") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("enables the steer button when allowSteer is true and onSteer is provided", () => {
    const { getByLabelText } = render(
      <QueuedMessages
        messages={[queuedMessage({ text: "check this" })]}
        onRemove={vi.fn()}
        onSteer={vi.fn()}
        allowSteer={true}
      />,
    );

    expect((getByLabelText("chat.steer") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows queued notification commands and lifecycle summaries", () => {
    const { container, getAllByText, getByText, queryByLabelText } = render(
      <QueuedMessages
        messages={[
          {
            parts: [
              {
                type: "data-background-job-notification",
                data: {
                  notificationId: "notification-1",
                  backgroundJobId: "bgjob-cmd-1",
                  outputFile: "/tmp/bgjob-cmd-1.log",
                  command: "sleep 2 && echo secret",
                  status: "completed",
                  summary:
                    'Background command "sleep 2 && echo secret" completed',
                  exitCode: 0,
                  finishedAt: 1,
                },
              },
              {
                type: "data-background-job-notification",
                data: {
                  notificationId: "notification-2",
                  backgroundJobId: "bgjob-cmd-2",
                  outputFile: "/tmp/bgjob-cmd-2.log",
                  command: "sleep 4 && echo hidden",
                  status: "completed",
                  summary:
                    'Background command "sleep 4 && echo hidden" completed',
                  exitCode: 0,
                  finishedAt: 2,
                },
              },
            ],
            raw: {
              text: "raw command summaries",
              nonRemovable: true,
            },
          },
        ]}
        onRemove={vi.fn()}
        onSteer={vi.fn()}
      />,
    );

    expect(getByText("backgroundJobNotifications.title")).toBeTruthy();
    expect(getByText("2").getAttribute("data-slot")).toBe("badge");
    const firstCommand = getByText("sleep 2 && echo secret");
    expect(firstCommand).toBeTruthy();
    const notificationItems = firstCommand.parentElement?.parentElement;
    expect(notificationItems?.classList.contains("ml-5")).toBe(false);
    expect(notificationItems?.classList.contains("-ml-1")).toBe(true);
    expect(getByText("sleep 4 && echo hidden")).toBeTruthy();
    expect(queryByLabelText("completed")).toBeNull();
    expect(getAllByText("completed")).toHaveLength(2);
    expect(container.textContent).not.toContain("Job 1");
    expect(container.textContent).not.toContain("raw command summaries");
    expect(container.querySelector(".lucide-bell")).toBeTruthy();
    expect(queryByLabelText("Remove queued message")).toBeNull();
    expect(queryByLabelText("chat.steer")).toBeTruthy();
  });
});

function queuedMessage({
  text,
  isTodoMode = false,
  filesCount = 0,
  reviewsCount = 0,
  userEditsCount = 0,
  terminalContextCount = 0,
  activeSelection,
  nonRemovable,
}: {
  text: string;
  isTodoMode?: boolean;
  filesCount?: number;
  reviewsCount?: number;
  userEditsCount?: number;
  terminalContextCount?: number;
  activeSelection?: ActiveSelection;
  nonRemovable?: boolean;
}): DraftMessage {
  return {
    parts: [],
    raw: {
      text,
      filesCount,
      reviewsCount,
      userEditsCount,
      terminalContextCount,
      isTodoMode,
      activeSelection,
      nonRemovable,
    },
  };
}
