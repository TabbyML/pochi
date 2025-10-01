import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export class JsonRenderer {
  private pendingMessageId = "";
  constructor(private readonly state: NodeChatState) {
    this.state.signal.messages.subscribe((messages) => {
      const pendingMessageIndex = messages.findIndex(
        (message) => message.id === this.pendingMessageId,
      );

      const pendingMessages = messages.slice(pendingMessageIndex);
      for (const message of pendingMessages) {
        console.log(JSON.stringify(message));
      }
    });
  }

  shutdown() {}

  renderSubTask(_task: TaskRunner) {}
}
