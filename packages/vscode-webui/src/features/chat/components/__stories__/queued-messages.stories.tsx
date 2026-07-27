import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";

import type {
  ActiveSelection,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
import type { DraftMessage } from "../../hooks/use-chat-submit";
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

const sampleActiveSelection: ActiveSelection = {
  filepath:
    "packages/vscode-webui/src/features/chat/components/queued-messages.tsx",
  range: {
    start: { line: 10, character: 0 },
    end: { line: 20, character: 0 },
  },
  content: `export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
  onSteer,
}) => {`,
};

const sampleTerminalTextSelection: TerminalTextSelection = {
  terminalName: "bash",
  content: "$ bun run test\n✓ all tests passed",
};

export const Default: Story = {
  args: {
    messages: [
      queuedMessage({ text: "Hello, this is a test message." }),
      queuedMessage({
        text: "This is another test message that is very long and should be truncated, This is another test message that is very long and should be truncated.",
      }),
      queuedMessage({
        text: "Prompt with mention, <file>packages/vscode-webui/src/features/chat/components/queued-messages</file>",
      }),
      queuedMessage({
        text: `This is a prompt with multi line.
      This is another line`,
      }),
      queuedMessage({ text: "This is a todo mode prompt", isTodoMode: true }),
      queuedMessage({
        text: "This is a prompt with an active editor selection",
        activeSelection: sampleActiveSelection,
      }),
      queuedMessage({
        text: "This is a prompt with an active terminal selection",
        activeTerminalTextSelection: sampleTerminalTextSelection,
      }),
      queuedMessage({
        text: "This is a prompt with both selections",
        activeSelection: sampleActiveSelection,
        activeTerminalTextSelection: sampleTerminalTextSelection,
      }),
      queuedMessage({
        text: "This is a prompt with attached files",
        filesCount: 2,
      }),
      queuedMessage({
        text: "This is a prompt with pending reviews",
        reviewsCount: 3,
      }),
      queuedMessage({
        text: "This is a prompt with files and reviews",
        filesCount: 1,
        reviewsCount: 2,
      }),
      queuedMessage({
        text: "This is a prompt with files, reviews and selections",
        filesCount: 2,
        reviewsCount: 1,
        activeSelection: sampleActiveSelection,
        activeTerminalTextSelection: sampleTerminalTextSelection,
      }),
      queuedMessage({ text: "This is a prompt" }),
    ],
  },
};

function queuedMessage({
  text,
  isTodoMode = false,
  filesCount = 0,
  reviewsCount = 0,
  userEditsCount = 0,
  activeSelection,
  activeTerminalTextSelection,
}: {
  text: string;
  isTodoMode?: boolean;
  filesCount?: number;
  reviewsCount?: number;
  userEditsCount?: number;
  activeSelection?: ActiveSelection;
  activeTerminalTextSelection?: TerminalTextSelection;
}): DraftMessage {
  return {
    parts: [],
    raw: {
      text,
      filesCount,
      reviewsCount,
      userEditsCount,
      isTodoMode,
      activeSelection,
      activeTerminalTextSelection,
    },
  };
}
