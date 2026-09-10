import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PromptFormSlashExtension,
  SlashMentionPluginKey,
} from "../slash-mention/extension";
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
      PromptFormSlashExtension.configure({
        suggestion: {
          char: "/",
          pluginKey: SlashMentionPluginKey,
          allow: createMentionSuggestionAllow(PromptFormSlashExtension.name),
        },
      }),
    ],
    content: "<p>f</p>",
  });
}

function isSuggestionActive(instance: Editor) {
  return !!SlashMentionPluginKey.getState(instance.state)?.active;
}

/** Types the trigger char to the left of the existing `f`, giving `/f`. */
function typeTriggerBeforeText(instance: Editor) {
  instance.view.dispatch(instance.state.tr.insertText("/", 1));
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

describe("suggestion activation", () => {
  it("opens the suggestion when the trigger char is typed", () => {
    editor = createEditor();
    typeTriggerBeforeText(editor);

    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("keeps the suggestion open while text is typed", () => {
    editor = createEditor();
    typeTriggerBeforeText(editor);
    editor.view.dispatch(editor.state.tr.insertText("a", 2));

    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("keeps the suggestion open on metadata only transactions", () => {
    editor = createEditor();
    typeTriggerBeforeText(editor);
    editor.view.dispatch(editor.state.tr.setMeta("forceUpdate", true));

    expect(isSuggestionActive(editor)).toBe(true);
  });

  it("closes the suggestion when the caret moves without a text update", () => {
    editor = createEditor();
    typeTriggerBeforeText(editor);
    expect(isSuggestionActive(editor)).toBe(true);

    // Arrow right: the caret stays inside `/f`, so the query would still match.
    editor.commands.setTextSelection(3);

    expect(isSuggestionActive(editor)).toBe(false);
  });
});
