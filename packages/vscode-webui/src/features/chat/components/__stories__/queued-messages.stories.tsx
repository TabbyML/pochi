import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import type { QueuedMessage } from "../../hooks/use-chat-submit";
import { QueuedMessages } from "../queued-messages";

const meta = {
  title: "Features/Chat/QueuedMessages",
  component: QueuedMessages,
  args: {
    onRemove: fn(),
  },
} satisfies Meta<typeof QueuedMessages>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    messages: [
      queuedMessage("Hello, this is a test message."),
      queuedMessage(
        "This is another test message that is very long and should be truncated, This is another test message that is very long and should be truncated.",
      ),
      queuedMessage(
        "Prompt with mention, <file>packages/vscode-webui/src/features/chat/components/queued-messages</file>",
      ),
      queuedMessage(`This is a prompt with multi line.
      This is another line`),
      queuedMessage("This is a todo mode prompt", true),
      queuedMessage("This is a prompt"),
      queuedMessage("This is a prompt"),
      queuedMessage("This is a prompt"),
      queuedMessage("This is a prompt"),
    ],
  },
};

function queuedMessage(text: string, isTodoMode = false): QueuedMessage {
  return {
    text,
    files: [],
    reviews: [],
    isTodoMode,
  };
}
