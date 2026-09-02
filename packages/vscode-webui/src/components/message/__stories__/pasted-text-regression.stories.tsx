import { formatters } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChatInputForm } from "../../../features/chat/components/chat-input-form";
import type { ChatInput } from "../../../features/chat/hooks/use-chat-input-state";
import { AttachmentPreviewList } from "../../attachment-preview-list";
import { MessageList } from "../message-list";

const CapturedPromptLength = 406_311;
const capturedPromptPrefix =
  '[{\\"role\\":\\"system\\",\\"content\\":\\"You are Pochi, a highly skilled software engineer';
const largeSerializedMessageList = capturedPromptPrefix.padEnd(
  CapturedPromptLength,
  "x",
);

const messages: Message[] = [
  {
    id: "large-pasted-user-message",
    role: "user",
    parts: [
      {
        type: "data-pasted-text",
        data: { text: largeSerializedMessageList },
      },
      {
        type: "file",
        filename: "design-mockup.png",
        mediaType: "image/png",
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nxoAAAAASUVORK5CYII=",
      },
    ],
  },
  {
    id: "streaming-assistant-message",
    role: "assistant",
    parts: [
      { type: "text", text: "First streamed assistant part." },
      { type: "text", text: "Second streamed assistant part." },
    ],
  },
];

const meta = {
  title: "Message/PastedTextRegression",
  component: MessageList,
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
  },
} satisfies Meta<typeof MessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WhileCompactingAndStreaming: Story = {
  args: {
    messages,
    user: { name: "jueliang fung" },
    isLoading: true,
    loadingLabel: "Compacting...",
    formatMessages: formatters.ui,
    renderAllMessages: true,
  },
};

function ComposerAttachmentRowStory() {
  const [input, setInput] = useState<ChatInput>({
    json: null,
    text: "",
    pastedTexts: [largeSerializedMessageList],
  });
  const [files, setFiles] = useState(() => [
    new File(["pdf preview"], "report.pdf", { type: "application/pdf" }),
    new File(["log preview"], "output.log", { type: "text/plain" }),
  ]);

  return (
    <div className="max-w-2xl p-4">
      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={async () => {}}
        onCtrlSubmit={async () => {}}
        isLoading={false}
        editable
        onPaste={() => {}}
        pendingApproval={undefined}
        status="ready"
        isSubTask={false}
        reviews={[]}
      >
        <AttachmentPreviewList
          files={files}
          onRemove={(index) =>
            setFiles((current) =>
              current.filter((_, itemIndex) => itemIndex !== index),
            )
          }
          isUploading={false}
          className="contents"
        />
      </ChatInputForm>
    </div>
  );
}

export const ComposerAttachmentRow: Story = {
  render: ComposerAttachmentRowStory,
  args: {
    messages: [],
    isLoading: false,
    loadingLabel: "",
    formatMessages: formatters.ui,
  },
};
