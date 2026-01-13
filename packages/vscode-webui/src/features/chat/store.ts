import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";

export interface EditorContent {
  json: JSONContent | null;
  text: string;
}

export interface ChatUiState {
  editorContent: EditorContent;
  updateEditorContent: (content: Partial<EditorContent>) => void;
  clearEditorContent: () => void;
}

export const useChatUiStore = create<ChatUiState>()((set) => ({
  editorContent: {
    json: null,
    text: "",
  },
  updateEditorContent: (content: Partial<EditorContent>) =>
    set((state) => ({
      editorContent: { ...state.editorContent, ...content },
    })),
  clearEditorContent: () =>
    set(() => ({
      editorContent: { json: null, text: "" },
    })),
}));
