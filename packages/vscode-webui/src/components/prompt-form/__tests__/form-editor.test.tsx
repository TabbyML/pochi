// @vitest-environment jsdom

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { FormEditor } from "../form-editor";

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  });
});

vi.mock("@/features/settings", () => ({
  useSelectedModels: () => ({
    updateSelectedModelId: vi.fn(),
    models: [],
  }),
}));

vi.mock("@/lib/hooks/use-active-tabs", () => ({
  useActiveTabs: () => [],
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    getSessionState: vi.fn().mockResolvedValue({}),
    setSessionState: vi.fn().mockResolvedValue(undefined),
    getGlobalState: vi.fn().mockResolvedValue(undefined),
    setGlobalState: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("FormEditor pasted text", () => {
  it("intercepts an eligible paste without inserting it into TipTap", async () => {
    const editorRef = createRef<Editor | null>();
    const onPastedText = vi.fn();
    const setInput = vi.fn();
    const largeText = "x".repeat(5_001);
    const { container } = render(
      <FormEditor
        input={{ json: null, text: "" }}
        setInput={setInput}
        onSubmit={vi.fn()}
        onCtrlSubmit={vi.fn()}
        isLoading={false}
        isSubTask={false}
        editorRef={editorRef}
        onPastedText={onPastedText}
        autoFocus={false}
        enableSubmitHistory={false}
      />,
    );

    await waitFor(() => expect(editorRef.current).toBeTruthy());
    const editorElement = container.querySelector("[contenteditable=true]");
    expect(editorElement).toBeTruthy();
    const pasteEvent = new Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        getData: (type: string) => (type === "text/plain" ? largeText : ""),
        files: [],
      },
    });

    fireEvent(editorElement as Element, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(onPastedText).toHaveBeenCalledWith(largeText);
    expect(editorRef.current?.getText()).toBe("");
  });

  it("preserves pasted text drafts when the editor text changes", async () => {
    const editorRef = createRef<Editor | null>();
    const setInput = vi.fn();
    render(
      <FormEditor
        input={{
          json: null,
          text: "",
          pastedTexts: ["large pasted text"],
        }}
        setInput={setInput}
        onSubmit={vi.fn()}
        onCtrlSubmit={vi.fn()}
        isLoading={false}
        isSubTask={false}
        editorRef={editorRef}
        autoFocus={false}
        enableSubmitHistory={false}
      />,
    );

    await waitFor(() => expect(editorRef.current).toBeTruthy());
    act(() => {
      editorRef.current?.commands.insertContent("Analyze this");
    });

    expect(setInput).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Analyze this",
        pastedTexts: ["large pasted text"],
      }),
    );
  });
});
