import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { TextSelection } from "@tiptap/pm/state";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PromptFormMentionExtension,
  fileMentionPluginKey,
  fileMentionPreviewPluginKey,
} from "../context-mention/extension";
import {
  TextUpdateTrackerExtension,
  createMentionSuggestionAllow,
} from "../suggestion-activation";

let editor: Editor | undefined;

function createEditor() {
  return new Editor({
    extensions: [
      TextUpdateTrackerExtension,
      Document,
      Paragraph,
      Text,
      PromptFormMentionExtension.configure({
        suggestion: {
          char: "@",
          pluginKey: fileMentionPluginKey,
          allow: createMentionSuggestionAllow(
            PromptFormMentionExtension.name,
          ),
        },
      }),
    ],
  });
}

function showPreview(instance: Editor, pos = instance.state.selection.from) {
  instance.view.dispatch(
    instance.state.tr.setMeta(fileMentionPreviewPluginKey, {
      filepath: "packages/example.ts",
      pos,
    }),
  );
}

function pressKey(instance: Editor, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    cancelable: true,
    ...init,
  });
  return (
    instance.view.someProp("handleKeyDown", (handleKeyDown) =>
      handleKeyDown(instance.view, event),
    ) ?? false
  );
}

function isSuggestionActive(instance: Editor) {
  return !!fileMentionPluginKey.getState(instance.state)?.active;
}

function getPreview(instance: Editor) {
  return instance.view.dom.querySelector("[data-file-mention-preview]");
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("file mention preview", () => {
  it("closes the preview without consuming ArrowRight at the document end", () => {
    editor = createEditor();
    editor.view.dispatch(editor.state.tr.insertText("@use-retr", 1));
    showPreview(editor);
    expect(isSuggestionActive(editor)).toBe(true);
    expect(getPreview(editor)).not.toBeNull();

    const handled = pressKey(editor, { key: "ArrowRight" });

    expect(handled).toBe(false);
    expect(isSuggestionActive(editor)).toBe(false);
    expect(getPreview(editor)).toBeNull();
  });

  it("closes the preview without consuming ArrowRight before trailing text", () => {
    editor = createEditor();
    const tr = editor.state.tr.insertText("@use-retrx", 1);
    tr.setSelection(TextSelection.create(tr.doc, 10));
    editor.view.dispatch(tr);
    showPreview(editor);
    expect(isSuggestionActive(editor)).toBe(true);
    expect(editor.state.doc.textBetween(10, 11)).toBe("x");
    expect(getPreview(editor)).not.toBeNull();

    const handled = pressKey(editor, { key: "ArrowRight" });

    expect(handled).toBe(false);
    expect(isSuggestionActive(editor)).toBe(false);
    expect(getPreview(editor)).toBeNull();
  });

  it("does not handle ArrowRight away from the preview boundary", () => {
    editor = createEditor();
    editor.view.dispatch(editor.state.tr.insertText("@use-retr", 1));
    showPreview(editor, editor.state.selection.from - 1);

    expect(pressKey(editor, { key: "ArrowRight" })).toBe(false);
    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("leaves composing ArrowRight events to the IME", () => {
    editor = createEditor();
    editor.view.dispatch(editor.state.tr.insertText("@use-retr", 1));
    showPreview(editor);

    expect(
      pressKey(editor, { key: "ArrowRight", isComposing: true }),
    ).toBe(false);
    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("leaves ArrowRight to the IME while the editor is composing", () => {
    editor = createEditor();
    editor.view.dispatch(editor.state.tr.insertText("@use-retr", 1));
    showPreview(editor);
    editor.view.dom.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(editor.view.composing).toBe(true);

    expect(pressKey(editor, { key: "ArrowRight" })).toBe(false);
    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("renders the preview as non-editable and non-selectable", () => {
    editor = createEditor();
    editor.view.dispatch(editor.state.tr.insertText("@use-retr", 1));
    showPreview(editor);

    const preview = getPreview(editor);

    expect(preview?.getAttribute("contenteditable")).toBe("false");
    expect(preview?.classList.contains("select-none")).toBe(true);
  });
});
