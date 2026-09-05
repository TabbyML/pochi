// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatInputForm } from "./chat-input-form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "pastedText.label" ? "Localized pasted text" : key,
  }),
}));

vi.mock("@/components/dev-retry-countdown", () => ({
  DevRetryCountdown: () => null,
}));
vi.mock("@/components/prompt-form/active-selection-badge", () => ({
  ActiveSelectionBadge: () => null,
}));
vi.mock("@/components/prompt-form/add-context-menu", () => ({
  AddContextMenu: () => null,
}));
vi.mock("@/components/prompt-form/form-editor", () => ({
  FormEditor: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/prompt-form/review-badges", () => ({
  ReviewBadges: () => null,
}));
vi.mock("@/components/prompt-form/terminal-context-badges", () => ({
  TerminalContextBadges: () => null,
}));
vi.mock("@/components/prompt-form/user-edits", () => ({
  UserEdits: () => null,
}));
vi.mock("@/lib/hooks/use-active-selection", () => ({
  useActiveSelection: () => undefined,
}));
vi.mock("./queued-messages", () => ({
  QueuedMessages: () => null,
}));

describe("ChatInputForm pasted text", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders pasted text in the same attachment row as files", () => {
    render(
      <ChatInputForm
        input={{
          json: null,
          text: "",
          pastedTexts: ["large pasted text"],
        }}
        setInput={vi.fn()}
        onSubmit={vi.fn()}
        onCtrlSubmit={vi.fn()}
        isLoading={false}
        onPaste={vi.fn()}
        pendingApproval={undefined}
        status="ready"
        isSubTask={false}
        reviews={[]}
      >
        <div data-testid="file-attachments" />
      </ChatInputForm>,
    );

    expect(screen.getByTestId("pasted-text-card").parentElement).toBe(
      screen.getByTestId("file-attachments").parentElement,
    );
  });

  it("uses a short title and supports hover preview with click pinning", () => {
    vi.useFakeTimers();
    const pastedText = `0123456789ABCDEFGHIJ\n${"x".repeat(6_000)}`;

    render(
      <ChatInputForm
        input={{ json: null, text: "", pastedTexts: [pastedText] }}
        setInput={vi.fn()}
        onSubmit={vi.fn()}
        onCtrlSubmit={vi.fn()}
        isLoading={false}
        onPaste={vi.fn()}
        pendingApproval={undefined}
        status="ready"
        isSubTask={false}
        reviews={[]}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "0123456789ABCDEFGHIJ",
    });
    expect(screen.getByText("0123456789A…")).toBeTruthy();
    expect(screen.queryByText(pastedText)).toBeNull();

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const preview = screen.getByText(
      (_content, element) =>
        element?.tagName === "PRE" && element.textContent === pastedText,
    );
    expect(preview).toBeTruthy();
    expect(preview.parentElement?.className).toContain("max-h-80");
    expect(preview.parentElement?.className).toContain("w-[min(48rem,80vw)]");
    expect(preview.parentElement?.className).toContain("overflow-auto");

    fireEvent.click(trigger);
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "PRE" && element.textContent === pastedText,
      ),
    ).toBeTruthy();
  });

  it("localizes and removes pasted-text cards", () => {
    const pastedText = `Analyze this\n${"x".repeat(6_000)}`;
    const whitespaceText = " ".repeat(5_001);
    const setInput = vi.fn();

    render(
      <ChatInputForm
        input={{
          json: null,
          text: "",
          pastedTexts: [pastedText, whitespaceText],
        }}
        setInput={setInput}
        onSubmit={vi.fn()}
        onCtrlSubmit={vi.fn()}
        isLoading={false}
        onPaste={vi.fn()}
        pendingApproval={undefined}
        status="ready"
        isSubTask={false}
        reviews={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Analyze this" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Localized pasted text" }),
    ).toBeTruthy();
    const removeButton = screen.getAllByRole("button", {
      name: "pastedText.remove",
    })[0];
    expect(removeButton).toBeTruthy();
    if (!removeButton) throw new Error("Expected a pasted-text remove button");
    fireEvent.click(removeButton);
    expect(setInput).toHaveBeenCalledWith({
      json: null,
      text: "",
      pastedTexts: [whitespaceText],
    });
  });
});
