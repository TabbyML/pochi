import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";

export interface ChatInput {
  json: JSONContent | null;
  text: string;
}

export interface ChatInputState {
  input: ChatInput;
  setInput: (content: Partial<ChatInput>) => void;
  clearInput: () => void;
}

export const useChatInputState = create<ChatInputState>()((set) => ({
  input: {
    json: null,
    text: "",
  },
  setInput: (content: Partial<ChatInput>) =>
    set((state) => ({
      input: { ...state.input, ...content },
    })),
  clearInput: () =>
    set(() => ({
      input: { json: null, text: "" },
    })),
}));
