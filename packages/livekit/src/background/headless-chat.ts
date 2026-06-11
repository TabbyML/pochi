import { signal } from "@preact/signals-core";
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
} from "ai";
import type { Message } from "../types";

class HeadlessChatState implements ChatState<Message> {
  readonly signal = {
    status: signal<ChatStatus>("ready"),
    error: signal<Error | undefined>(undefined),
    messages: signal<Message[]>([]),
  };

  get status() {
    return this.signal.status.value;
  }

  set status(chatStatus: ChatStatus) {
    this.signal.status.value = chatStatus;
  }

  get error() {
    return this.signal.error.value;
  }

  set error(error: Error | undefined) {
    this.signal.error.value = error;
  }

  get messages() {
    return this.signal.messages.value;
  }

  set messages(messages: Message[]) {
    this.signal.messages.value = messages;
  }

  constructor(initialMessages: Message[] = []) {
    this.messages = initialMessages;
  }

  pushMessage = (message: Message) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: Message) => {
    this.messages = [
      ...this.messages.slice(0, index),
      this.snapshot(message),
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

export class HeadlessChat extends AbstractChat<Message> {
  constructor({ messages, ...init }: ChatInit<Message>) {
    const state = new HeadlessChatState(messages);
    super({ ...init, state });
  }

  appendOrReplaceMessage(message: Message) {
    const index = this.state.messages.findIndex((m) => m.id === message.id);
    if (index === -1) {
      this.state.pushMessage(message);
    } else {
      this.state.replaceMessage(index, message);
    }
  }

  getState() {
    return this.state as HeadlessChatState;
  }
}
