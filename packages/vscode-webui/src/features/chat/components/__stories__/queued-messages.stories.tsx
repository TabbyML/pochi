import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import { QueuedMessages } from "../queued-messages";

const meta = {
  title: "Chat/QueuedMessages",
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
      "Hello, this is a test message.",
      "This is another test message that is very long and should be truncated, This is another test message that is very long and should be truncated.",
      "Prompt with mention, <file>packages/vscode-webui/src/features/chat/components/queued-messages</file>",
      `This is a prompt with multi line.
      This is another line`,
      "This is a prompt",
      "This is a prompt",
      "This is a prompt",
      "This is a prompt",
    ],
  },
};
