// @vitest-environment jsdom
import type {
  ActiveSelection,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
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

vi.mock("@/lib/hooks/use-visible-terminals", () => ({
  useVisibleTerminals: () => ({ openBackgroundJobTerminal: vi.fn() }),
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

  it("renders a minimal icon-only preview for the active terminal selection captured at queue time", () => {
    const activeTerminalTextSelection: TerminalTextSelection = {
      terminalName: "bash",
      content: "echo hello",
    };

    const { container, getByLabelText } = render(
      <QueuedMessages
        messages={[
          queuedMessage({
            text: "check this",
            activeTerminalTextSelection,
          }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    // Icon-only trigger, keyed to the terminal name, without a visible name label.
    expect(getByLabelText("activeSelectionBadge.terminal: bash")).toBeTruthy();
    expect(container.textContent).not.toContain("bash");
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
});

function queuedMessage({
  text,
  isTodoMode = false,
  filesCount = 0,
  reviewsCount = 0,
  userEditsCount = 0,
  activeSelection,
  activeTerminalTextSelection,
}: {
  text: string;
  isTodoMode?: boolean;
  filesCount?: number;
  reviewsCount?: number;
  userEditsCount?: number;
  activeSelection?: ActiveSelection;
  activeTerminalTextSelection?: TerminalTextSelection;
}): DraftMessage {
  return {
    parts: [],
    raw: {
      text,
      filesCount,
      reviewsCount,
      userEditsCount,
      isTodoMode,
      activeSelection,
      activeTerminalTextSelection,
    },
  };
}
