import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";

export interface EditorContent {
  json: JSONContent | null;
  text: string;
}

export interface ChatInputState {
  input: EditorContent;
  setInput: (content: Partial<EditorContent>) => void;
  clearInput: () => void;
}

export const useChatInputState = create<ChatInputState>()((set) => ({
  input: {
    json: null,
    text: "",
  },
  setInput: (content: Partial<EditorContent>) =>
    set((state) => ({
      input: { ...state.input, ...content },
    })),
  clearInput: () =>
    set(() => ({
      input: { json: null, text: "" },
    })),
}));
